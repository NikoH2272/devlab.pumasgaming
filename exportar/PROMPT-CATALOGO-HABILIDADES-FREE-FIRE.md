# Prompt para cargar habilidades y descripciones de personajes

Usa este prompt en Gemini cada vez que documentes un personaje. Adjunta una captura o pega una fuente oficial/actualizada del juego. No pidas al modelo que complete datos de memoria.

```text
Actúa como catalogador de datos de Free Fire para un analizador táctico de formaciones. Documenta únicamente el personaje y la habilidad que aparecen en la fuente adjunta. La fuente adjunta manda: no completes huecos con memoria ni inventes cifras. Si un dato no aparece, escribe null y añádelo a "pendiente_verificar".

Devuelve solo JSON válido, sin Markdown, con este esquema:
{
  "juego": "Free Fire",
  "version_o_fecha_de_fuente": "",
  "personaje": {
    "nombre_oficial": "",
    "slug": "",
    "descripcion": "Resumen fiel del personaje; no atribuyas efectos de juego aquí.",
    "rol_tactico_inferido": [],
    "rol_inferido_explicacion": "Separa inferencias de hechos. Usa solo: entrada, soporte, información, movilidad, control, supervivencia, daño, utilidad."
  },
  "habilidad": {
    "nombre_oficial": "",
    "tipo": "activa|pasiva|desconocido",
    "descripcion_oficial_parafraseada": "",
    "efecto_mecanico": "",
    "valores_y_condiciones": [],
    "enfriamiento_segundos": null,
    "duracion_segundos": null,
    "alcance": null,
    "objetivo": "propio|aliado|enemigo|zona|desconocido",
    "limitaciones": [],
    "sinergias_probables": [],
    "riesgos_o_contras": [],
    "fuente": "Identifica título/documento o texto visible; no inventes URL"
  },
  "pendiente_verificar": []
}

Mantén las unidades exactamente como en la fuente. Si la fuente está en otro idioma, traduce al español sin cambiar números, condiciones ni alcance. No conviertas una interpretación táctica en efecto oficial. Si aparecen varias habilidades/personajes, devuelve un objeto por cada uno dentro de un array llamado "registros".
```

## Prompt para revisar el catálogo antes de importarlo

```text
Valida estos registros JSON contra las fuentes adjuntas. Señala nombres duplicados o slugs inconsistentes, campos obligatorios ausentes, valores que no coinciden con la fuente y efectos confundidos con inferencias. No corrijas inventando: devuelve los registros corregidos solo cuando una fuente lo respalde y una lista "requiere_revision" con el resto. Conserva la fecha/versión de cada fuente.
```

El catálogo actual de la pantalla de composición contiene nombres e iconos y solo clasifica con certeza una parte de activa/pasiva. La clasificación no incluye todavía descripciones mecánicas completas; importa esos datos desde fuentes actuales antes de pedir una evaluación de sinergias.
