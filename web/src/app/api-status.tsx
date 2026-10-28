"use client";

import { CircleCheckIcon, CircleXIcon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";

export type ApiHealth =
  | { readonly state: "loading" }
  | { readonly state: "ok"; readonly env: string }
  | { readonly state: "down" };

export function ApiStatusBadge({ status }: { readonly status: ApiHealth }) {
  return (
    <div role="status">
      {status.state === "loading" ? (
        <Badge variant="neutral">
          <LoaderIcon aria-hidden className="motion-safe:animate-spin" />
          Conectando con la API…
        </Badge>
      ) : status.state === "ok" ? (
        <Badge variant="saved">
          <CircleCheckIcon aria-hidden />
          API conectada ({status.env})
        </Badge>
      ) : (
        <Badge variant="danger">
          <CircleXIcon aria-hidden />
          La API no responde
        </Badge>
      )}
    </div>
  );
}

export function ApiStatus() {
  const [status, setStatus] = useState<ApiHealth>({ state: "loading" });

  useEffect(() => {
    api
      .GET("/api/health")
      .then(({ data }) =>
        setStatus(data ? { state: "ok", env: data.env } : { state: "down" }),
      )
      .catch(() => setStatus({ state: "down" }));
  }, []);

  return <ApiStatusBadge status={status} />;
}
