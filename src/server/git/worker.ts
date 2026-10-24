/** Runs inside the owned sandbox. All user input goes through JSON and argv, never a shell. */
export const gitWorker = String.raw`
import os, sys, json, subprocess, tempfile, shutil, uuid, time, fcntl
from pathlib import Path

class GitError(Exception):
    pass

def main(payload):
    workspace = Path('/workspace').resolve()
    root = Path(payload.get('path', '/workspace')).resolve()
    if root != workspace and workspace not in root.parents:
        raise GitError('Repository must be inside /workspace.')
    action = payload.get('action', 'status')
    if action == 'discover':
        found = []
        for base, dirs, files in os.walk(workspace):
            if '.git' in dirs or '.git' in files:
                found.append(base)
                dirs[:] = []
            else:
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'vendor', 'dist', 'build')]
                if len(Path(base).relative_to(workspace).parts) >= 4:
                    dirs[:] = []
            if len(found) >= 30:
                break
        return found
    if action in ('init', 'clone'):
        root.mkdir(parents=True, exist_ok=True)
    if not root.is_dir():
        raise GitError('Repository directory does not exist.')
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10')
    def git(*args, extra=None, allowed=(0,), data=None):
        result = subprocess.run(['git', '-c', 'core.quotePath=false', '-c', 'color.ui=false', '-c', 'protocol.file.allow=never', '-c', 'protocol.ext.allow=never', *args], cwd=root,
            env=dict(env, **(extra or {})), input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
        if result.returncode not in allowed:
            # Remote errors may include authenticated URLs; avoid reflecting them.
            if action in ('clone', 'fetch', 'pull', 'push'):
                raise GitError('Remote operation failed. Check authentication and upstream configuration in the machine console.')
            raise GitError(result.stderr.decode('utf-8', 'replace').strip()[:2000] or 'Git operation failed.')
        return result.stdout
    def remote_url():
        import re
        url = payload.get('url', '')
        if not (re.fullmatch(r'https://[A-Za-z0-9.-]+(?::[0-9]+)?/[A-Za-z0-9_./~%-]+', url) or re.fullmatch(r'git@[A-Za-z0-9.-]+:[A-Za-z0-9_./~-]+', url)):
            raise GitError('Use an HTTPS or git@host:path repository URL without embedded credentials. Configure credentials in the machine console.')
        return url
    if action == 'clone':
        if any(root.iterdir()):
            raise GitError('Choose an empty directory for cloning.')
        git('clone', '--', remote_url(), '.')
    if action == 'init':
        git('init', '--initial-branch=main')
    try:
        actual_root = Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve()
    except GitError:
        return {'initialized': False, 'path': str(root)} if action == 'status' else fail('Initialize a Git repository first.')
    if actual_root != root:
        raise GitError('Choose the repository root: ' + str(actual_root))
    gitdir = Path(git('rev-parse', '--absolute-git-dir').decode().strip()).resolve()
    # A gitfile/worktree may point elsewhere inside the workspace, but never outside it.
    if workspace not in gitdir.parents:
        raise GitError('Git metadata must be inside /workspace.')
    lock = open(gitdir / 'minimachines.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise GitError('Another Git operation is running. Try again shortly.')
    def text(*args, **kwargs):
        return git(*args, **kwargs).decode('utf-8', 'replace').strip()
    def head():
        return text('rev-parse', '--verify', 'HEAD', allowed=(0,128))
    def selected_file():
        name = payload.get('file', '')
        if not name or name.startswith('/') or '..' in Path(name).parts or '\x00' in name:
            raise GitError('Invalid repository file path.')
        # literal pathspecs prevent magic, wildcard expansion and option injection.
        return ':(literal)' + name
    def commit_tree(tree, message, parent=None):
        args = ['commit-tree', tree]
        if parent:
            args += ['-p', parent]
        return text(*args, extra={'GIT_AUTHOR_NAME':'Mini Machines','GIT_AUTHOR_EMAIL':'agent@minimachines.local',
            'GIT_COMMITTER_NAME':'Mini Machines','GIT_COMMITTER_EMAIL':'agent@minimachines.local'}, data=message.encode())
    def working_tree():
        with tempfile.TemporaryDirectory(prefix='mm-index-', dir=gitdir) as temp:
            alternate = {'GIT_INDEX_FILE':str(Path(temp) / 'index')}
            git('read-tree', '--empty', extra=alternate)
            git('add', '-A', '--', '.', extra=alternate)
            tree = text('write-tree', extra=alternate)
        return tree
    def checkpoint(label=None):
        if text('ls-files', '--unmerged'):
            raise GitError('Resolve merge conflicts before creating a checkpoint.')
        index_tree = text('write-tree')
        old_head = head()
        tree = working_tree()
        metadata = {'label':label or payload.get('message') or 'Agent checkpoint',
            'agent':payload.get('agent') or 'manual', 'baseHead':old_head, 'indexTree':index_tree}
        sha = commit_tree(tree, json.dumps(metadata), old_head or None)
        ref = 'refs/minimachines/checkpoints/' + str(time.time_ns()) + '-' + uuid.uuid4().hex[:8]
        git('update-ref', ref, sha)
        return {'ref':ref, 'sha':sha, **metadata}
    def require_checkpoint():
        ref = payload.get('ref', '')
        if not ref.startswith('refs/minimachines/checkpoints/') or not all(c.isalnum() or c in '/-' for c in ref):
            raise GitError('Invalid checkpoint reference.')
        sha = text('rev-parse', '--verify', ref + '^{commit}')
        return ref, sha, json.loads(text('show', '-s', '--format=%B', sha))
    def require_stash():
        sha = payload.get('ref', '')
        entries = text('stash', 'list', '--format=%H').splitlines()
        if sha not in entries:
            raise GitError('Stash no longer exists. Refresh the list.')
        return sha, 'stash@{' + str(entries.index(sha)) + '}'
    def limited_diff(*args):
        raw = git(*args)
        return {'text':raw[:250000].decode('utf-8', 'replace'), 'truncated':len(raw) > 250000}
    if action in ('init', 'clone', 'status'):
        files, records = [], git('status', '--porcelain=v1', '-z', '--untracked-files=all').split(b'\0')
        i = 0
        while i < len(records):
            record = records[i].decode('utf-8', 'replace'); i += 1
            if len(record) < 4:
                continue
            x, y, name = record[0], record[1], record[3:]
            original = None
            if x in 'RC' or y in 'RC':
                original = records[i].decode('utf-8', 'replace'); i += 1
            files.append({'path':name,'originalPath':original,'index':x,'worktree':y,
                'conflict':x == 'U' or y == 'U' or x+y in ('AA','DD')})
        checkpoints = []
        for line in text('for-each-ref', '--sort=-refname', '--format=%(refname)%09%(objectname)%09%(committerdate:iso-strict)', 'refs/minimachines/checkpoints/').splitlines()[:50]:
            ref, sha, created = line.split('\t')
            try:
                meta = json.loads(text('show','-s','--format=%B',sha))
                checkpoints.append({'ref':ref,'sha':sha,'createdAt':created,**meta})
            except (ValueError, KeyError):
                pass
        stashes = []
        for line in text('stash','list','--format=%H%x09%gd%x09%aI%x09%gs').splitlines()[:50]:
            sha, ref, created, message = line.split('\t',3)
            stashes.append({'sha':sha,'ref':ref,'createdAt':created,'message':message})
        history = []
        if head():
            for line in text('log','-25','--format=%H%x09%aI%x09%an%x09%s').splitlines():
                sha, created, author, message = line.split('\t',3)
                history.append({'sha':sha,'createdAt':created,'author':author,'message':message})
        remotes = []
        import re
        for name in text('remote').splitlines():
            url = text('remote','get-url',name)
            url = re.sub(r'(https?://)[^/@]+@', r'\1[redacted]@', url).split('?')[0].split('#')[0]
            remotes.append({'name':name,'url':url})
        branch = text('symbolic-ref','--short','HEAD',allowed=(0,1)) or 'Detached HEAD'
        return {'initialized':True,'path':str(root),'branch':branch,'head':head(),
            'upstream':text('rev-parse','--abbrev-ref','--symbolic-full-name','@{u}',allowed=(0,128)) or None,
            'files':files[:2000],'filesTruncated':len(files)>2000,'checkpoints':checkpoints,'stashes':stashes,
            'history':history,'remotes':remotes,'branches':text('branch','--format=%(refname:short)').splitlines()}
    if action == 'diff':
        file = selected_file()
        if payload.get('layer') == 'staged':
            return limited_diff('diff','--cached','--no-ext-diff','--no-textconv','--',file)
        if payload.get('layer') == 'untracked':
            name = payload['file']
            if name.encode() not in git('ls-files','--others','--exclude-standard','-z').split(b'\0'):
                raise GitError('File is no longer untracked. Refresh changes.')
            path = root / name
            if path.is_symlink():
                return {'text':'Symlink → ' + os.readlink(path),'truncated':False}
            with open(path,'rb') as handle:
                raw = handle.read(250001)
            if b'\0' in raw:
                return {'text':'Binary file — preview unavailable.','truncated':False}
            return {'text':'New file: ' + name + '\n' + raw[:250000].decode('utf-8','replace'),'truncated':len(raw)>250000}
        return limited_diff('diff','--no-ext-diff','--no-textconv','--',file)
    if action == 'checkpoint':
        return checkpoint()
    if action == 'checkpointDiff':
        ref, sha, meta = require_checkpoint()
        return limited_diff('diff','--no-ext-diff','--no-textconv',sha,working_tree(),'--','.')
    if action == 'restore':
        ref, sha, meta = require_checkpoint()
        if meta['baseHead'] != head():
            raise GitError('HEAD has changed since this checkpoint. Return to its original commit before restoring.')
        backup = checkpoint('Before restoring ' + meta['label'])
        untracked = git('ls-files','--others','--exclude-standard','-z').split(b'\0')
        target = set(git('ls-tree','-r','--name-only','-z',sha).split(b'\0'))
        git('read-tree','--reset','-u',sha)
        for name in untracked:
            if name and name not in target:
                path = root / os.fsdecode(name)
                if path.is_file() or path.is_symlink():
                    path.unlink()
        git('read-tree',meta['indexTree'])
        return {'message':'Checkpoint restored. Your previous work is saved in a recovery checkpoint.','backup':backup}
    if action == 'stage':
        git('add','-A','--',selected_file())
    elif action == 'unstage':
        if head():
            git('restore','--staged','--',selected_file())
        else:
            git('rm','--cached','--',selected_file())
    elif action == 'commit':
        message = payload.get('message','').strip()
        if not message:
            raise GitError('Enter a commit message.')
        if git('diff','--cached','--quiet',allowed=(0,1)) == b'':
            # diff --quiet emits no text for either exit code; compare trees instead.
            if text('write-tree') == (text('rev-parse','HEAD^{tree}') if head() else text('hash-object','-t','tree','--stdin', data=b'')):
                raise GitError('Stage changes before committing.')
        git('commit','-m',message)
    elif action == 'stash':
        if not text('status','--porcelain'):
            raise GitError('No changes to stash.')
        checkpoint('Before stashing changes')
        git('stash','push','--include-untracked','-m',payload.get('message') or 'Dashboard stash')
    elif action == 'stashDiff':
        sha, selector = require_stash()
        return limited_diff('stash','show','--include-untracked','--patch','--no-ext-diff','--no-textconv',sha)
    elif action == 'applyStash':
        sha, selector = require_stash()
        checkpoint('Before applying stash')
        git('stash','apply','--index',sha)
    elif action == 'dropStash':
        sha, selector = require_stash()
        # Keep the stash object reachable, including its untracked parent, for recovery.
        git('update-ref','refs/minimachines/dropped-stashes/' + uuid.uuid4().hex,sha)
        git('stash','drop',selector)
    elif action == 'branch':
        name = payload.get('message','').strip()
        git('check-ref-format','--branch',name)
        if not head():
            raise GitError('Make an initial commit before creating a branch.')
        if text('status','--porcelain'):
            raise GitError('Commit or stash your changes before switching branches.')
        git('switch','-c',name)
    elif action == 'switch':
        name = payload.get('message','')
        if name not in text('branch','--format=%(refname:short)').splitlines():
            raise GitError('Unknown local branch.')
        if text('status','--porcelain'):
            raise GitError('Commit or stash your changes before switching branches.')
        git('switch','--',name)
    elif action == 'fetch':
        git('fetch','--all')
    elif action == 'pull':
        if text('status','--porcelain'):
            raise GitError('Commit or stash your changes before pulling.')
        git('pull','--ff-only')
    elif action == 'push':
        if text('rev-parse','--abbrev-ref','--symbolic-full-name','@{u}',allowed=(0,128)):
            git('push')
        else:
            branch = text('symbolic-ref','--short','HEAD',allowed=(0,1))
            if not branch:
                raise GitError('Switch to a branch before pushing.')
            git('push','--set-upstream','origin',branch)
    elif action == 'remote':
        git('remote','add','origin',remote_url())
    else:
        raise GitError('Unsupported Git action.')
    return {'message':'Git operation completed.'}

def fail(message):
    raise GitError(message)

try:
    print(json.dumps({'ok':True,'data':main(json.loads(sys.argv[1]))}))
except subprocess.TimeoutExpired:
    print(json.dumps({'ok':False,'error':'Git operation timed out. Check the machine console before retrying.'}))
except Exception as error:
    print(json.dumps({'ok':False,'error':str(error)[:2000]}))
`;
