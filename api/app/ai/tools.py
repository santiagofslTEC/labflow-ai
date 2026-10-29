"""The one tool call the model returns per sentence (spec 0006, The tool call). Both
adapters must return a `ToolCall`. The model picks what to do and quotes the words it read;
code checks, converts, decides, and replies."""

import unicodedata
from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated, Literal, cast

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
    return model_schema(model)


def model_schema(model: type[BaseModel]) -> dict[str, object]:
    """A model's JSON schema, without the `tool` discriminator when it has one."""
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


# --- Reading experiment instructions (spec 0005, AC-33): one tool, `proponer_cuaderno` ---

SETUP_VARIABLES_MAX = 30  # the model may list up to 30 so the count is honest; code cuts to 12


class ProposedVariable(_Frozen):
    name: str = Field(description="El nombre de la variable, corto («Temperatura»).")
    unit: str | None = Field(
        default=None, description="La unidad tal como está escrita («°C», «min», «%»), o null."
    )
    min_value: float | None = Field(
        default=None, description="El mínimo, solo si el texto lo dice; si no, null."
    )
    max_value: float | None = Field(
        default=None, description="El máximo, solo si el texto lo dice; si no, null."
    )
    required: bool = Field(default=True, description="false solo si el texto dice que es opcional.")
    range_quote: str | None = Field(
        default=None,
        description="Las palabras EXACTAS del texto que dan el rango, sin cambios, o null.",
    )


class ProponerCuaderno(_Frozen):
    title: str = Field(default="", description="Un título corto para el cuaderno.")
    goal: str | None = Field(default=None, description="El objetivo de la práctica, o null.")
    context: str | None = Field(
        default=None,
        description="Hasta 600 caracteres: qué se mide, cómo se organizan los ensayos, "
        "y las condiciones clave.",
    )
    found_count: int = Field(
        default=0, description="Cuántas variables encontraste en total (code recounts)."
    )
    variables: list[ProposedVariable] = Field(
        default_factory=list[ProposedVariable], max_length=SETUP_VARIABLES_MAX
    )


SETUP_TOOL_NAME = "proponer_cuaderno"
SETUP_TOOL_DESCRIPTION = (
    "Proponer el título, el objetivo, el contexto y las variables del cuaderno leídos de las "
    "instrucciones."
)


def parse_setup_call(name: str, arguments: Mapping[str, object]) -> ProponerCuaderno:
    """Validate a `proponer_cuaderno` call. Raises `ValueError` for another tool, and
    `pydantic.ValidationError` on bad arguments. A list over 30 is cut, not refused."""
    if name != SETUP_TOOL_NAME:
        raise ValueError(f"unexpected tool {name}")
    variables = arguments.get("variables")
    if isinstance(variables, list):
        listed = cast(list[object], variables)
        arguments = {**arguments, "variables": listed[:SETUP_VARIABLES_MAX]}
    return ProponerCuaderno.model_validate(arguments)
