import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { env } from "@/env";

import {
  ExternalPreviewProvider,
  useExternalPreview,
} from "../external-preview";

export interface ArtifactsContextType {
  artifacts: string[];
  setArtifacts: (artifacts: string[]) => void;

  selectedArtifact: string | null;
  autoSelect: boolean;
  select: (artifact: string, autoSelect?: boolean) => void;
  deselect: () => void;

  open: boolean;
  autoOpen: boolean;
  setOpen: (open: boolean) => void;
}

const ArtifactsContext = createContext<ArtifactsContextType | undefined>(
  undefined,
);

interface ArtifactsProviderProps {
  children: ReactNode;
}

export function ArtifactsProvider({ children }: ArtifactsProviderProps) {
  return (
    <ExternalPreviewProvider
      initialArtifactsVisible={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"}
    >
      <ArtifactsStateProvider>{children}</ArtifactsStateProvider>
    </ExternalPreviewProvider>
  );
}

function ArtifactsStateProvider({ children }: ArtifactsProviderProps) {
  const { artifactsVisible, showArtifacts, hideArtifacts } =
    useExternalPreview();
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [autoSelect, setAutoSelect] = useState(true);
  const [autoOpen, setAutoOpen] = useState(true);

  const select = useCallback(
    (artifact: string, autoSelect = false) => {
      setSelectedArtifact(artifact);
      if (!autoSelect) {
        showArtifacts();
        setAutoSelect(false);
      }
    },
    [showArtifacts],
  );

  const deselect = useCallback(() => {
    setSelectedArtifact(null);
    setAutoSelect(true);
    hideArtifacts();
  }, [hideArtifacts]);

  const value: ArtifactsContextType = {
    artifacts,
    setArtifacts,

    open: artifactsVisible,
    autoOpen,
    autoSelect,
    setOpen: (isOpen: boolean) => {
      if (!isOpen && autoOpen) {
        setAutoOpen(false);
        setAutoSelect(false);
      }
      if (isOpen) showArtifacts();
      else hideArtifacts();
    },

    selectedArtifact,
    select,
    deselect,
  };

  return (
    <ArtifactsContext.Provider value={value}>
      {children}
    </ArtifactsContext.Provider>
  );
}

export function useArtifacts() {
  const context = useContext(ArtifactsContext);
  if (context === undefined) {
    throw new Error("useArtifacts must be used within an ArtifactsProvider");
  }
  return context;
}
