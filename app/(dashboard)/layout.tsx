import DashboardShell from "@/components/layout/DashboardShell";
import AuthGuard from "@/components/layout/AuthGuard";
import DataPreloader from "@/components/layout/DataPreloader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DataPreloader />
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
