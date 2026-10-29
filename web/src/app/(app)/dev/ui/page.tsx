import {
  ArrowRightIcon,
  CircleCheckIcon,
  FlaskConicalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNumberCell,
  TableRow,
} from "@/components/ui/table";
import { isDevUiEnabled } from "@/lib/dev-ui";
import { formatQuantity } from "@/lib/format";

import { CardStatesDemo } from "./card-states-demo";
import { FormDemo, OverlaysDemo, TabsDemo } from "./controls-demo";
import { DockStatesDemo } from "./dock-states-demo";
import { FlightDemo } from "./flight-demo";
import {
  SAMPLE_EXPERIMENT_TITLE,
  SAMPLE_TRIALS,
  SAMPLE_VARIABLES,
} from "./sample-data";

export const metadata: Metadata = {
  title: "Sistema de diseño · LabFlow AI",
  robots: { index: false, follow: false },
};

// Literal class names so Tailwind generates every swatch.
const COLORS = [
  ["canvas", "bg-canvas", "Fondo de la página"],
  ["surface", "bg-surface", "Tarjetas, dock, tabla"],
  ["sunken", "bg-sunken", "Campos en reposo, cabecera de tabla"],
  ["ink", "bg-ink", "Texto y botón principal"],
  ["ink-muted", "bg-ink-muted", "Texto secundario y etiquetas"],
  ["on-ink", "bg-on-ink", "Texto sobre el botón principal"],
  ["line", "bg-line", "Divisores decorativos"],
  ["control", "bg-control", "Bordes de campos (3:1)"],
  ["brand", "bg-brand", "Acento: acción principal, micrófono"],
  ["brand-soft", "bg-brand-soft", "Acento suave: activo, halo"],
  ["saved", "bg-saved", "Guardado"],
  ["unsaved", "bg-unsaved", "Tinte sin guardar"],
  ["unsaved-border", "bg-unsaved-border", "Borde sin guardar"],
  ["warning-ink", "bg-warning-ink", "Texto de aviso"],
  ["danger", "bg-danger", "Errores, Descartar"],
  ["focus", "bg-focus", "Anillo de foco"],
  ["chart-1", "bg-chart-1", "Serie 1"],
  ["chart-2", "bg-chart-2", "Serie 2"],
  ["chart-3", "bg-chart-3", "Serie 3"],
  ["chart-4", "bg-chart-4", "Serie 4"],
] as const;

const NAV = [
  ["fundamentos", "Fundamentos"],
  ["componentes", "Componentes"],
  ["tarjeta", "Tarjeta de propuesta"],
  ["vuelo", "Tarjeta a tabla"],
  ["dock", "Dock del micrófono"],
] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-24 flex-col gap-6 border-t border-line pt-10"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-title font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Specimen({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-ink">{label}</h3>
      {children}
    </div>
  );
}

export default function DevUiPage() {
  if (!isDevUiEnabled(process.env.VERCEL_ENV)) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Solo desarrollo y vistas previas"
        title="Sistema de diseño"
        description={
          <>
            Cada pieza y cada estado, con los datos del experimento de ejemplo.
            El tema sigue al de tu sistema. Detalles en{" "}
            <code className="font-mono text-sm">web/design.md</code>.
          </>
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="/dev/ui/workspace">
              Ver el espacio de trabajo
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        }
      />

      <nav aria-label="Secciones">
        <ul className="flex flex-wrap gap-2">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink focus-ring hover:bg-sunken"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section
        id="fundamentos"
        title="Fundamentos"
        description="Colores, tipografía, radios y sombras. Los valores viven en globals.css; un test comprueba el contraste en ambos temas."
      >
        <Specimen label="Color">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {COLORS.map(([name, swatch, use]) => (
              <li key={name} className="flex flex-col gap-2">
                <span
                  aria-hidden
                  className={`h-16 rounded-control border border-line ${swatch}`}
                />
                <span className="font-mono text-xs text-ink">{name}</span>
                <span className="text-xs text-ink-muted">{use}</span>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen label="Tipografía">
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
            <p className="text-display font-semibold text-ink lg:text-display-lg">
              Tu cuaderno de laboratorio
            </p>
            <p className="text-title font-semibold text-ink">
              {SAMPLE_EXPERIMENT_TITLE}
            </p>
            <p className="text-base text-ink">
              Cuerpo en Geist, 16/24. Dicta una medición y confirma lo que
              LabFlow entendió.
            </p>
            <p className="text-sm text-ink-muted">
              Texto pequeño, 14/20, para ayudas y detalles.
            </p>
            <p className="text-xs font-medium text-ink-muted">Etiqueta 12/16</p>
            <p className="font-mono text-readout text-ink tabular-nums lg:text-readout-lg">
              {formatQuantity(73.5, "%")}
            </p>
            <p className="font-mono text-cell text-ink tabular-nums">
              {formatQuantity(50, "°C")} · {formatQuantity(15, "min")} ·{" "}
              {formatQuantity(7.2, null)}
            </p>
          </div>
        </Specimen>

        <Specimen label="Radio y sombra">
          <div className="flex flex-wrap gap-4">
            <div className="flex size-32 items-end rounded-card border border-line bg-surface p-3 text-xs text-ink-muted shadow-card">
              card · 14px
            </div>
            <div className="flex size-32 items-end rounded-control border border-line bg-surface p-3 text-xs text-ink-muted">
              control · 10px
            </div>
            <div className="flex size-32 items-end rounded-card bg-surface p-3 text-xs text-ink-muted shadow-dock">
              sombra dock
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="componentes"
        title="Componentes"
        description="Piezas base de shadcn/ui sobre Radix, con los tokens. Prueba todo con Tab: cada control muestra el mismo anillo de foco."
      >
        <Specimen label="Botones">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Confirmar</Button>
              <Button variant="secondary">Editar</Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="danger">Descartar</Button>
              <Button disabled>Desactivado</Button>
              <Button aria-disabled>
                <Spinner data-icon="inline-start" />
                Guardando…
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">Confirmar · 48px</Button>
              <Button size="lg" variant="ghost">
                Descartar · 48px
              </Button>
              <Button size="icon" variant="secondary" aria-label="Aviso">
                <TriangleAlertIcon aria-hidden />
              </Button>
              <Button size="icon-lg" variant="ghost" aria-label="Confirmado">
                <CircleCheckIcon aria-hidden />
              </Button>
            </div>
          </div>
        </Specimen>

        <Specimen label="Insignias">
          <div className="flex flex-wrap gap-3">
            <Badge variant="neutral">Conectando</Badge>
            <Badge variant="saved">
              <CircleCheckIcon aria-hidden />
              Guardado
            </Badge>
            <Badge variant="unsaved">Sin guardar</Badge>
            <Badge variant="warning">
              <TriangleAlertIcon aria-hidden />
              Fuera de rango
            </Badge>
            <Badge variant="danger">La API no responde</Badge>
          </div>
        </Specimen>

        <div className="grid gap-10 lg:grid-cols-2">
          <Specimen label="Formulario">
            <FormDemo />
          </Specimen>
          <div className="flex flex-col gap-10">
            <Specimen label="Pestañas">
              <TabsDemo />
            </Specimen>
            <Specimen label="Diálogo y avisos">
              <OverlaysDemo />
            </Specimen>
            <Specimen label="Tarjeta">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>{SAMPLE_EXPERIMENT_TITLE}</CardTitle>
                  <CardDescription>5 ensayos · 3 variables</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-ink-muted">
                  Última medición hace 2 minutos.
                </CardContent>
                <CardFooter>
                  <Button variant="secondary">Abrir</Button>
                </CardFooter>
              </Card>
            </Specimen>
          </div>
        </div>

        <Specimen label="Tabla">
          <Table>
            <TableCaption>
              Experimento de ejemplo, datos ficticios.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Ensayo</TableHead>
                {SAMPLE_VARIABLES.map((variable) => (
                  <TableHead key={variable.id} className="text-right">
                    {variable.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_TRIALS.map((trial) => (
                <TableRow key={trial.trialNumber}>
                  <TableCell className="font-mono text-cell tabular-nums">
                    {trial.trialNumber}
                  </TableCell>
                  {SAMPLE_VARIABLES.map((variable, index) => (
                    <TableNumberCell key={variable.id}>
                      {formatQuantity(trial.values[index] ?? 0, variable.unit)}
                    </TableNumberCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Specimen>

        <div className="grid gap-10 lg:grid-cols-2">
          <Specimen label="Cargando">
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Specimen>
          <Specimen label="Vacío">
            <EmptyState
              icon={FlaskConicalIcon}
              title="Aún no hay ensayos"
              description="Dicta o escribe tu primera medición."
              headingLevel="h3"
            />
          </Specimen>
        </div>
      </Section>

      <Section
        id="tarjeta"
        title="Tarjeta de propuesta"
        description="La estrella de la demo. Elige un estado: cada acción muestra en un aviso qué callback llamó. La tarjeta mueve el foco a su acción principal al aparecer."
      >
        <CardStatesDemo />
      </Section>

      <Section
        id="vuelo"
        title="Tarjeta a tabla"
        description="Confirma: cada valor vuela a su celda de la nueva fila, y después la tarjeta se cierra. Con movimiento reducido, todo es un fundido breve."
      >
        <FlightDemo />
      </Section>

      <Section
        id="dock"
        title="Dock del micrófono"
        description="En la app va fijo abajo; aquí se muestra en línea. El campo de texto funciona en todos los estados."
      >
        <DockStatesDemo />
      </Section>
    </div>
  );
}
