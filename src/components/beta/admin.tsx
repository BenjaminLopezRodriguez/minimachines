"use client";
import { api, type RouterOutputs } from "~/trpc/react";
import { useState } from "react";
type Applicant = RouterOutputs["beta"]["queue"]["applicants"][number];
export function BetaAdmin() {
  const queue = api.beta.queue.useQuery();
  const utils = api.useUtils();
  const reviewFeedback = api.beta.reviewFeedback.useMutation({
    onSuccess: () => utils.beta.queue.invalidate(),
  });
  if (queue.isPending) return <p role="status">Loading testers…</p>;
  if (queue.error) return <p role="alert">{queue.error.message}</p>;
  const { applicants, feedback, metrics } = queue.data;
  return (
    <div className="mm-beta-admin">
      <h1>Beta testing</h1>
      <p className="mm-beta-lead">
        Review verified applicants in small groups, then follow the feedback
        from each cohort.
      </p>
      <dl className="mm-beta-metrics">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h2>Tester pool</h2>
      <p className="mm-beta-fine">
        Latest 300 applications. Approval opens access; it doesn’t send an
        email. Invite testers personally using their preferred contact method.
      </p>
      <div className="mm-beta-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Project</th>
              <th>Access</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {applicants.map((entry) => (
              <ApplicantRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
        {!applicants.length && <p>No applicants yet.</p>}
      </div>
      <h2>Feedback inbox</h2>
      {feedback.map((item) => (
        <article className="mm-beta-feedback-item" key={item.id}>
          <div>
            <strong>
              {item.kind} · {item.surface}
            </strong>
            <span>
              {item.rating ? `${item.rating}/5 · ` : ""}
              {new Date(item.createdAt).toLocaleDateString()} · {item.status}
            </span>
          </div>
          <p>{item.message}</p>
          <small>User {item.userId}</small>
          <label className="sr-only" htmlFor={`feedback-${item.id}`}>
            Feedback status
          </label>
          <select
            className="mm-beta-input"
            id={`feedback-${item.id}`}
            value={item.status}
            disabled={reviewFeedback.isPending}
            onChange={(e) =>
              reviewFeedback.mutate({
                id: item.id,
                status: e.target.value as "new" | "reviewed" | "resolved",
              })
            }
          >
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
          </select>
        </article>
      ))}
      {!feedback.length && <p>No feedback yet.</p>}
      {reviewFeedback.error && (
        <p role="alert">{reviewFeedback.error.message}</p>
      )}
    </div>
  );
}
function ApplicantRow({ entry }: { entry: Applicant }) {
  const [cohort, setCohort] = useState(entry.cohort ?? "beta-01");
  const utils = api.useUtils();
  const review = api.beta.review.useMutation({
    onSuccess: () => utils.beta.queue.invalidate(),
  });
  return (
    <tr>
      <td>
        <strong>{entry.email}</strong>
        <small>
          {entry.verifiedAt ? "Verified account" : "Email not verified"} ·{" "}
          {entry.feedbackConsent
            ? "Open to interviews"
            : "No interview consent"}
        </small>
      </td>
      <td>
        {entry.role ?? "—"}
        <small>{entry.useCase ?? "No project details yet"}</small>
      </td>
      <td>{entry.status}</td>
      <td>
        <label className="sr-only" htmlFor={`cohort-${entry.id}`}>
          Cohort for {entry.email}
        </label>
        <input
          className="mm-beta-input"
          id={`cohort-${entry.id}`}
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          maxLength={80}
        />
        <div className="mm-beta-row-actions">
          <button
            disabled={!entry.verifiedAt || review.isPending}
            onClick={() =>
              review.mutate({ id: entry.id, status: "approved", cohort })
            }
          >
            Approve
          </button>
          <button
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: entry.id, status: "pending", cohort })
            }
          >
            Wait
          </button>
          <button
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: entry.id, status: "revoked", cohort })
            }
          >
            Pause
          </button>
        </div>
        {review.error && <p role="alert">{review.error.message}</p>}
      </td>
    </tr>
  );
}
