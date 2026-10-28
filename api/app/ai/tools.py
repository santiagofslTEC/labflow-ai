"""The one tool call the model returns per sentence (spec 0006, The tool call). Both
adapters must return a `ToolCall`. The model picks what to do and quotes the words it read;
code checks, converts, decides, and replies."""

import unicodedata
from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.services.text import fold


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ExtractedValue(_Frozen):
    variable_id: int = Field(description="El id de la variable.")
    number_text: str = Field(
        description="Las palabras exactas del número, copiadas de la frase (ej. «setenta y tres»)."
    )
    value: float = Field(description="El número tal como se dijo, sin convertir unidades.")
    unit_text: str | None = Field(
        default=None, description="Las palabras de la unidad tal como se dijeron, o null."
    )


class ProponerMedicion(_Frozen):
    tool: Literal["proponer_medicion"] = "proponer_medicion"
    trial_number: int | None = Field(default=None, description="El número de ensayo dicho.")
    values: list[ExtractedValue] = Field(default_factory=list[ExtractedValue])


class Corregir(_Frozen):
    tool: Literal["corregir"] = "corregir"
    values: list[ExtractedValue] = Field(default_factory=list[ExtractedValue])


class ElegirEnsayo(_Frozen):
    tool: Literal["elegir_ensayo"] = "elegir_ensayo"
    kind: Literal["correccion", "nuevo"]
    trial_number: int | None = None


class Confirmar(_Frozen):
    tool: Literal["confirmar"] = "confirmar"


class Descartar(_Frozen):
    tool: Literal["descartar"] = "descartar"


class PedirAclaracion(_Frozen):
    tool: Literal["pedir_aclaracion"] = "pedir_aclaracion"
    reason: Literal["ambiguous_variable", "off_topic", "not_supported_yet"]
    variable_ids: list[int] = Field(default_factory=list[int])


type ToolCall = Annotated[
    ProponerMedicion | Corregir | ElegirEnsayo | Confirmar | Descartar | PedirAclaracion,
    Field(discriminator="tool"),
]

TOOL_CALL: TypeAdapter[ToolCall] = TypeAdapter(ToolCall)

# Tool name → (arguments model, description for the model).
TOOLS: Mapping[str, tuple[type[_Frozen], str]] = MappingProxyType(
    {
        "proponer_medicion": (
            ProponerMedicion,
            "Registrar valores medidos y/o el número de ensayo que dijo el usuario.",
        ),
        "corregir": (
            Corregir,
            "Cambiar valores de la tarjeta pendiente («no, el rendimiento es 73»).",
        ),
        "elegir_ensayo": (
            ElegirEnsayo,
            "Responder si un ensayo repetido es una corrección o un ensayo nuevo.",
        ),
        "confirmar": (Confirmar, "El usuario pide guardar la tarjeta pendiente («sí, guárdalo»)."),
        "descartar": (Descartar, "El usuario pide descartar la tarjeta pendiente."),
        "pedir_aclaracion": (
            PedirAclaracion,
            "No se puede registrar: variable ambigua, fuera de tema, o pregunta/gráfica.",
        ),
    }
)


def arguments_schema(name: str) -> dict[str, object]:
    """The JSON schema of a tool's arguments, without the `tool` discriminator."""
    model, _ = TOOLS[name]
    schema = model.model_json_schema()
    properties = dict(schema.get("properties", {}))
    properties.pop("tool", None)
    required = [field for field in schema.get("required", []) if field != "tool"]
    return {**schema, "properties": properties, "required": required}


# Spellings models use for `elegir_ensayo.kind` besides the schema's own.
_KIND_SPELLINGS: Mapping[str, str] = MappingProxyType(
    {"correccion": "correccion", "correction": "correccion", "nuevo": "nuevo", "new": "nuevo"}
)


def parse_tool_call(name: str, arguments: Mapping[str, object]) -> ToolCall:
    """Validate a model's tool call. A tool outside the union (including `consultar_dato`
    and `graficar`, kept for features 9 and 10) becomes `not_supported_yet`, never a failure.
    Raises `pydantic.ValidationError` on bad arguments for a known tool."""
    if name not in TOOLS:
        return PedirAclaracion(reason="not_supported_yet")
    kind = arguments.get("kind")
    if name == "elegir_ensayo" and isinstance(kind, str):
        arguments = {
            **arguments,
            "kind": _KIND_SPELLINGS.get(fold(unicodedata.normalize("NFC", kind.strip())), kind),
        }
    return TOOL_CALL.validate_python({**arguments, "tool": name})
