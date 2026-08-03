import DashboardShell from "@/components/layout/DashboardShell";
import AuthGuard from "@/components/layout/AuthGuard";
import DataPreloader from "@/components/layout/DataPreloader";
import TicketWatcher from "@/components/layout/TicketWatcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DataPreloader />
      <TicketWatcher />
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
