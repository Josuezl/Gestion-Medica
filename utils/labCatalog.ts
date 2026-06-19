// Catálogo estándar de exámenes de laboratorio (basado en la orden de laboratorio de ejemplo).
// Es la fuente única para sembrar el catálogo de una clínica: el botón "Cargar catálogo estándar"
// en Configuración (clínicas existentes) y provisionTenant (clínicas nuevas).
// El orden de las categorías y de los exámenes define cómo se ven en el modal y en la impresión.

export interface LabCatalogCategory {
  category: string
  tests: string[]
}

export const DEFAULT_LAB_CATALOG: LabCatalogCategory[] = [
  {
    category: 'HEMATOLOGÍA',
    tests: [
      'Biometría Hemática Completa',
      'Hematocrito/Hemoglobina',
      'Leucocitos y Fórmula',
      'Eritrosedimentación',
      'Plaquetas',
      'Índices hematimétricos',
      'Reticulocitos',
      'Grupo S y Rh',
      'Sed. Wintrobe',
      'Hemoparasito',
    ],
  },
  {
    category: 'ENZIMAS',
    tests: [
      'Amilasa',
      'Lipasa',
      'Fosfatasa Alcalina',
      'LDH',
      'TGO/AST',
      'TGP/ALP',
      'G.G.T',
      'CPK',
      'CK-MB',
    ],
  },
  {
    category: 'SEROINMUNOLOGÍA',
    tests: ['H.I.V', 'VDRL', 'Aglutinaciones', 'ASTO', 'PCR', 'LATEX R.F'],
  },
  {
    category: 'COAGULACIÓN',
    tests: [
      'T. de Trombina',
      'T. de Sangría',
      'T. de Protombina/INR',
      'T. de Tromboplastina',
      'Plaquetas',
      'Fibrinógeno',
      'Dímero D',
    ],
  },
  {
    category: 'QUÍMICA SANGUÍNEA',
    tests: [
      'Glucosa Basal',
      'Glucosa Pospandrial',
      'Curva de Tolerancia a la G.',
      'Urea',
      'BUN ureico',
      'Creatinina',
      'Ácido Úrico',
      'Colesterol total',
      'Colesterol HDL',
      'Colesterol LDL',
      'Triglicéridos',
      'VLDL',
      'Bilirrubinas',
      'Proteínas Totales',
      'Albúminas',
      'Globulinas',
      'Hemoglobina Glicosilada',
    ],
  },
  {
    category: 'TORCH',
    tests: [
      'Toxo IgG',
      'Toxo IgM',
      'Rubeola IgG',
      'Rubeola IgM',
      'CMV IgG',
      'CMV IgM',
      'Herpes I IgG',
      'Herpes I IgM',
      'Herpes II IgG',
      'Herpes II IgM',
    ],
  },
  {
    category: 'ORINA',
    tests: [
      'Examen de Orina Completo',
      'GRAM',
      'Gota Fresca',
      'Urocultivo-Antibiograma',
      'Aclaramiento de Creatinina',
      'Proteinuria',
      'Creatinina',
      'Microalbuminuria',
    ],
  },
  {
    category: 'HECES',
    tests: [
      'Examen de Heces',
      'Polimorfonucleares',
      'Sangre oculta',
      'Rotavirus',
      'Azucares reductores',
      'Coproparasitario seriado',
      'Coproparasitario',
    ],
  },
  {
    category: 'HORMONAS',
    tests: [
      'T3',
      'FT3',
      'T4',
      'FT4',
      'TSH',
      'LH',
      'FSH',
      'HCG',
      'HCG-BETA',
      'Estradiol',
      'Testosterona',
      'Progesterona',
      'Prolactina',
      'Insulina',
    ],
  },
  {
    category: 'PANEL DE HEPATITIS',
    tests: ['Hepatitis A - HAV IgG', 'Hepatitis A - HAV IgM', 'Hepatitis B - HBsAG', 'Hepatitis C - HCV'],
  },
  {
    category: 'DROGAS DE ABUSO',
    tests: ['Marihuana', 'Cocaína'],
  },
  {
    category: 'LIQUIDOS',
    tests: ['Espermatograma', 'Citoquímico'],
  },
  {
    category: 'OTROS',
    tests: ['Helicobacter Pylori', 'Dengue IgG/IgM', 'Antitiroglobulinas (TG)'],
  },
  {
    category: 'MICROBIOLOGÍA',
    tests: ['Gram', 'Eosinófilos en moco nasal', 'Cultivo para Streptococcus beta Hemolíticos Grupo A'],
  },
]
