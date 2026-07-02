// This file contains only type definitions.
// All runtime data lives in Firestore — use lib/db/employees.ts to read/write.

export type EmployeeStatus = 'active' | 'on-leave' | 'remote';

export type AccessRole = "Administrator" | "Manager" | "Analyst" | "Contributor" | "Viewer";

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  accessRole?: AccessRole;
  status: EmployeeStatus;
  startDate: string;
  location: string;
  access?: string[];
  salary: number;
  department?: string;
  manager?: string;
  skills?: string[];
}

export interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
  headcount: number;
}

export interface ActivityItem {
  id: string;
  type: 'hire' | 'promotion' | 'leave' | 'return' | 'review';
  employee: string;
  description: string;
  date: string;
  avatar: string;
}

// Kept for legacy imports — real data is in Firestore
export const employees: Employee[] = [];
export const monthlyData: MonthlyData[] = [];
export const recentActivity: ActivityItem[] = [];
export const dashboardStats = {
  totalEmployees: 0,
  activeEmployees: 0,
  openPositions: 0,
  avgTenure: '-',
  monthlyRevenue: '-',
  revenueGrowth: '-',
  activeProjects: 0,
  completedThisMonth: 0,
};
