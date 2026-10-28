"use client";

import { BellIcon, FlaskConicalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/format";

function FormDemo() {
  const [value, setValue] = useState("abc");
  const invalid = value.trim() !== "" && !parseDecimal(value).ok;

  return (
    <FieldGroup className="max-w-md">
      <Field>
        <FieldLabel htmlFor="demo-title">Título del experimento</FieldLabel>
        <Input id="demo-title" placeholder="Rendimiento vs. temperatura" />
        <FieldDescription>Así aparecerá en tu lista.</FieldDescription>
      </Field>
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="demo-value">Valor</FieldLabel>
        <Input
          id="demo-value"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "demo-value-error" : undefined}
        />
        {invalid ? (
          <FieldError id="demo-value-error">
            Escribe un número, por ejemplo 73,5
          </FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="demo-unit">Unidad</FieldLabel>
        <Select defaultValue="°C">
          <SelectTrigger id="demo-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="°C">°C</SelectItem>
              <SelectItem value="min">min</SelectItem>
              <SelectItem value="%">%</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="demo-notes">Notas</FieldLabel>
        <Textarea id="demo-notes" placeholder="Catalizador nuevo, lote 12." />
      </Field>
      <Field data-disabled>
        <FieldLabel htmlFor="demo-disabled">Desactivado</FieldLabel>
        <Input id="demo-disabled" disabled defaultValue="No editable" />
      </Field>
    </FieldGroup>
  );
}

function OverlaysDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">
            <FlaskConicalIcon data-icon="inline-start" aria-hidden />
            Abrir diálogo
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Descartar la propuesta?</DialogTitle>
            <DialogDescription>
              Los valores del ensayo 3 no se guardarán. Puedes dictarlos otra
              vez.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger">Descartar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant="secondary"
        onClick={() => toast.success("Ensayo 3 guardado")}
      >
        <BellIcon data-icon="inline-start" aria-hidden />
        Mostrar aviso
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.error("No se pudo guardar")}
      >
        Aviso de error
      </Button>
    </div>
  );
}

function TabsDemo() {
  return (
    <Tabs defaultValue="conversation" className="max-w-md">
      <TabsList aria-label="Vistas de ejemplo">
        <TabsTrigger value="conversation">Conversación</TabsTrigger>
        <TabsTrigger value="table">Tabla</TabsTrigger>
        <TabsTrigger value="chart">Gráfico</TabsTrigger>
      </TabsList>
      <TabsContent value="conversation" className="p-1 text-sm text-ink-muted">
        Aquí van los mensajes y la tarjeta.
      </TabsContent>
      <TabsContent value="table" className="p-1 text-sm text-ink-muted">
        Aquí va la tabla de ensayos.
      </TabsContent>
      <TabsContent value="chart" className="p-1 text-sm text-ink-muted">
        Aquí va el gráfico.
      </TabsContent>
    </Tabs>
  );
}

export { FormDemo, OverlaysDemo, TabsDemo };
