"use client";

import { useEffect, useState } from "react";

import { api } from "@/api/client";

type Status =
  { state: "loading" } | { state: "ok"; env: string } | { state: "down" };

export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    api
      .GET("/api/health")
      .then(({ data }) =>
        setStatus(data ? { state: "ok", env: data.env } : { state: "down" }),
      )
      .catch(() => setStatus({ state: "down" }));
  }, []);

  if (status.state === "loading")
    return <p role="status">Conectando con la API…</p>;
  if (status.state === "down")
    return (
      <p role="status">
        La API no responde. ¿Está corriendo en el puerto 8000?
      </p>
    );
  return <p role="status">API conectada ({status.env})</p>;
}
