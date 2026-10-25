import { ApiKeysPanel } from "~/components/dashboard/api-keys-panel";
import { ProviderKeysPanel } from "~/components/dashboard/provider-keys-panel";

export default function DashboardSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 pb-20">
      <ApiKeysPanel />
      <ProviderKeysPanel />
    </div>
  );
}
