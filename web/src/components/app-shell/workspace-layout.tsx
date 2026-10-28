"use client";

import { useState } from "react";
import type * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DockSlot } from "./dock-slot";

type Panel = "conversation" | "table" | "chart";

type WorkspaceLayoutProps = {
  readonly conversation: React.ReactNode;
  readonly card?: React.ReactNode;
  readonly table: React.ReactNode;
  readonly chart: React.ReactNode;
  readonly dock: React.ReactNode;
};

const isPanel = (value: string): value is Panel =>
  value === "conversation" || value === "table" || value === "chart";

// One tree for every width (AC-14): below 1024px the tab list picks one panel and
// CSS hides the rest; at 1024px and up the tab list hides and the panels sit in
// two columns, the transcript on the left and the data on the right, split by a
// hairline. forceMount keeps every slot mounted exactly once.

// Two columns at 1024px and up; the dock repeats it so it sits under the transcript.
const COLUMNS =
  "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10";
function WorkspaceLayout({
  conversation,
  card,
  table,
  chart,
  dock,
}: WorkspaceLayoutProps) {
  const [panel, setPanel] = useState<Panel>("conversation");
  const cardWaiting = Boolean(card) && panel !== "conversation";

  return (
    <>
      <Tabs
        value={panel}
        onValueChange={(value) => {
          if (isPanel(value)) setPanel(value);
        }}
        className={`flex-1 gap-4 ${COLUMNS} lg:grid-rows-[auto_1fr] lg:gap-y-10`}
      >
        <TabsList
          aria-label="Vistas del experimento"
          className="sticky top-16 z-30 shadow-control lg:hidden"
        >
          <TabsTrigger value="conversation">
            Conversación
            {cardWaiting ? (
              <>
                {" "}
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-unsaved-border"
                />
                <span className="sr-only">Propuesta pendiente</span>
              </>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="table">Tabla</TabsTrigger>
          <TabsTrigger value="chart">Gráfico</TabsTrigger>
        </TabsList>

        <TabsContent
          forceMount
          value="conversation"
          className="flex flex-col gap-6 data-[state=inactive]:hidden lg:row-span-2 lg:border-r lg:border-line lg:pr-10 lg:data-[state=inactive]:flex"
        >
          <div>{conversation}</div>
          {card}
        </TabsContent>
        <TabsContent
          forceMount
          value="table"
          className="min-w-0 data-[state=inactive]:hidden lg:col-start-2 lg:row-start-1 lg:data-[state=inactive]:block"
        >
          {table}
        </TabsContent>
        <TabsContent
          forceMount
          value="chart"
          className="min-w-0 data-[state=inactive]:hidden lg:col-start-2 lg:row-start-2 lg:data-[state=inactive]:block"
        >
          {chart}
        </TabsContent>
      </Tabs>
      <DockSlot>
        {/* Mirrors AppShell's sheet and main container so the dock lines up
            with the transcript column; the empty right column lets clicks through. */}
        <div className="pointer-events-none lg:mr-2 lg:ml-60">
          <div
            className={`mx-auto w-full max-w-6xl px-3 pb-3 lg:px-10 lg:pb-4 ${COLUMNS}`}
          >
            <div className="pointer-events-auto">{dock}</div>
          </div>
        </div>
      </DockSlot>
    </>
  );
}

export { WorkspaceLayout };
export type { WorkspaceLayoutProps };
