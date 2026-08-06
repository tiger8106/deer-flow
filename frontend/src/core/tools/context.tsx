"use client";

import { createContext, useContext } from "react";

import type { ToolDisplayLabels } from "./display-labels";

const ToolDisplayLabelsContext = createContext<ToolDisplayLabels>({});

export function ToolDisplayLabelsProvider({
  labels,
  children,
}: {
  labels: ToolDisplayLabels;
  children: React.ReactNode;
}) {
  return (
    <ToolDisplayLabelsContext.Provider value={labels}>
      {children}
    </ToolDisplayLabelsContext.Provider>
  );
}

export function useToolDisplayLabels() {
  return useContext(ToolDisplayLabelsContext);
}
