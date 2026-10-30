import { ContinueCard } from "@/components/home/continue-card";
import { DashboardHeader } from "@/components/home/dashboard-header";
import { DashboardStats } from "@/components/home/dashboard-stats";
import { NotebookGrid } from "@/components/home/notebook-grid";

import { ApiStatus } from "./api-status";

// The lab dashboard (2026-10-30, replaces spec 0004's hero mic; colors from
// the hilos reference): the greeting, four colored counts, the notebook you
// were working on one tap from its mic, then your notebooks and class folders.
// The mic lives on the notebook page, where what you say lands.
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 lg:gap-8 lg:pt-2">
      <DashboardHeader />
      <DashboardStats />
      <ContinueCard />
      <NotebookGrid />
      <div className="mt-auto">
        <ApiStatus />
      </div>
    </div>
  );
}
