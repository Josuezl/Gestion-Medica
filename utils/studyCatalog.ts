// Catálogo estándar de estudios (estudios de gabinete: cardiología, radiología/ultrasonido, etc.).
// Es la fuente única para sembrar el catálogo de estudios de una clínica: el botón "Cargar catálogo
// estándar de estudios" en Configuración (clínicas existentes) y la provisión de clínicas nuevas.
// El orden de las secciones y de los estudios define cómo se ven en el modal y en la impresión.
//
// Cada estudio trae una INDICACIÓN para el paciente con la PREPARACIÓN real (ayuno, suspender
// medicamentos, vejiga llena, acompañante, etc.), como lista numerada y sin iconos/emojis. NO se
// incluyen tiempos de entrega de resultados, duración ni horarios/forma de atención: eso varía según
// el laboratorio y se comunica aparte. Las indicaciones de "Prueba de Esfuerzo" y "Ecocardiograma de
// Estrés con Dobutamina" son las que el médico (Cardiología) entregó (sin logística, enumeradas).

export interface StudyCatalogItem {
  name: string
  description?: string
  indication?: string
}

export interface StudyCatalogSection {
  section: string
  studies: StudyCatalogItem[]
}

export const DEFAULT_STUDY_CATALOG: StudyCatalogSection[] = [
  {
    section: 'Cardiología',
    studies: [
      {
        name: 'Electrocardiograma',
        description: 'Registro de la actividad eléctrica del corazón (ECG de 12 derivaciones).',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Evitar cremas o lociones en el tórax el día del estudio (dificultan la adhesión de los electrodos).\n3. Usar ropa cómoda y de fácil retiro en la parte superior.\n4. Llevar estudios y electrocardiogramas previos si los tiene.',
      },
      {
        name: 'Ecocardiograma Simple',
        description: 'Ultrasonido del corazón para evaluar estructura y función.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Usar ropa cómoda y de fácil retiro en la parte superior.\n3. Llevar estudios cardiológicos previos si los tiene.',
      },
      {
        name: 'Ecocardiograma Burbuja',
        description: 'Ecocardiograma con contraste salino agitado (estudio de burbujas) para detectar cortocircuitos.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno.\n2. Se coloca una vía intravenosa en el brazo para administrar el contraste salino.\n3. Asistir con un acompañante.\n4. Usar ropa cómoda y de fácil retiro en la parte superior.',
      },
      {
        name: 'Ecocardiograma con Strain en Paciente Oncológico',
        description: 'Ecocardiograma con análisis de strain para vigilancia de cardiotoxicidad por quimioterapia.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Llevar resúmenes oncológicos y esquema de quimioterapia/radioterapia recibidos.\n3. Llevar ecocardiogramas previos para comparación.\n4. Usar ropa cómoda y de fácil retiro en la parte superior.',
      },
      {
        name: 'Ecocardiograma Estrés en Banda sin fin',
        description: 'Ecocardiograma de estrés con ejercicio en banda sin fin (treadmill).',
        indication:
          'INDICACIONES:\n1. Ayuno mínimo de 3 a 4 horas.\n2. Asistir con un acompañante.\n3. Evitar el consumo de café o alimentos con cafeína en las 24 horas previas.\n4. Suspender betabloqueadores 72 horas antes, SOLO si su médico lo autoriza.\n5. Usar ropa cómoda para hacer ejercicio. Preferiblemente TENIS y ropa DEPORTIVA.',
      },
      {
        name: 'Ecocardiograma de Estrés con Dobutamina',
        description: 'Ecocardiograma de estrés farmacológico con dobutamina (para pacientes que no pueden ejercitarse).',
        indication:
          'INDICACIONES:\n1. Ayuno mínimo de 6 horas. No alimentos, no líquidos incluyendo agua.\n2. Asistir con un acompañante. Disponibilidad de tiempo por parte del paciente y de su acompañante. Sin embargo, al momento del estudio, solo el paciente entrará al consultorio. El acompañante esperará en sala de espera y se le llamará si es de ser necesario.\n3. Evitar el consumo de café o alimentos con cafeína en las 24 horas previas.\n4. Suspender los siguientes medicamentos, en caso de tomarlos, en las 72 horas previas al examen:\na) Betabloqueadores: Bisoprolol (concor, bisobloc, corentel), Metoprolol (betaloczok), Nebivolol (nabila, nebilet, xase), Propranolol, Atenolol.\nb) Calcio antagonistas: Diltiazem, Verapamilo.\nc) Nitratos: Cardiosorbide (isosorbide).\n\nPOR FAVOR TOMAR NOTA DE LAS INDICACIONES',
      },
      {
        name: 'Prueba de Esfuerzo',
        description: 'Electrocardiograma de esfuerzo en banda sin fin para evaluar el corazón durante el ejercicio.',
        indication:
          'INDICACIONES:\n1. Ayuno mínimo de 6 horas. No alimentos, no líquidos incluyendo agua.\n2. Asistir con un acompañante. Disponibilidad de tiempo por parte del paciente y de su acompañante. Sin embargo, al momento del estudio, solo el paciente entrará al consultorio. El acompañante esperará en sala de espera y se le llamará si es de ser necesario.\n3. Evitar el consumo de café o alimentos con cafeína en las 24 horas previas.\n4. Usar ropa cómoda para realizar ejercicio. Preferiblemente TENIS y ropa DEPORTIVA.\n5. Hombres: rasurar el tórax si es necesario para pegar bien los electrodos. Damas: deben traer un brassier deportivo o un strapless ajustado.',
      },
      {
        name: 'Monitoreo Ambulatorio de Presión Arterial (MAPA)',
        description: 'Registro automático de la presión arterial durante 24 horas en la vida cotidiana.',
        indication:
          'INDICACIONES:\n1. El día de la colocación, asistir con ropa cómoda y de manga corta o suelta (el brazalete va en el brazo).\n2. Continuar con sus actividades habituales durante el día.\n3. NO mojar el equipo: no bañarse mientras lo porta.\n4. Anotar en una hoja sus actividades, horas de sueño, síntomas y la toma de medicamentos.\n5. Mantener el brazo quieto y relajado cada vez que el equipo infle el brazalete.',
      },
      {
        name: 'Monitoreo Holter 24 horas',
        description: 'Registro continuo del electrocardiograma durante 24 horas.',
        indication:
          'INDICACIONES:\n1. Bañarse ANTES de la colocación: NO podrá hacerlo mientras porte el equipo.\n2. NO mojar el dispositivo ni los electrodos.\n3. Continuar con sus actividades habituales.\n4. Anotar en una hoja sus síntomas (palpitaciones, mareos, dolor) con la hora exacta y sus actividades.\n5. Evitar mantas eléctricas y campos magnéticos fuertes.\n6. Usar ropa holgada; los hombres con mucho vello en el tórax deben rasurarse para fijar los electrodos.',
      },
      {
        name: 'Monitoreo Holter 48 horas',
        description: 'Registro continuo del electrocardiograma durante 48 horas.',
        indication:
          'INDICACIONES:\n1. Bañarse ANTES de la colocación: NO podrá hacerlo mientras porte el equipo.\n2. NO mojar el dispositivo ni los electrodos.\n3. Continuar con sus actividades habituales.\n4. Anotar en una hoja sus síntomas (palpitaciones, mareos, dolor) con la hora exacta y sus actividades.\n5. Evitar mantas eléctricas y campos magnéticos fuertes.\n6. Usar ropa holgada; los hombres con mucho vello en el tórax deben rasurarse para fijar los electrodos.',
      },
      {
        name: 'Monitoreo Holter 72 horas',
        description: 'Registro continuo del electrocardiograma durante 72 horas.',
        indication:
          'INDICACIONES:\n1. Bañarse ANTES de la colocación: NO podrá hacerlo mientras porte el equipo.\n2. NO mojar el dispositivo ni los electrodos.\n3. Continuar con sus actividades habituales.\n4. Anotar en una hoja sus síntomas (palpitaciones, mareos, dolor) con la hora exacta y sus actividades.\n5. Evitar mantas eléctricas y campos magnéticos fuertes.\n6. Usar ropa holgada; los hombres con mucho vello en el tórax deben rasurarse para fijar los electrodos.',
      },
      {
        name: 'Monitoreo Holter 7 días',
        description: 'Registro continuo del electrocardiograma durante 7 días.',
        indication:
          'INDICACIONES:\n1. Bañarse ANTES de la colocación: NO podrá hacerlo mientras porte el equipo.\n2. NO mojar el dispositivo ni los electrodos.\n3. Continuar con sus actividades habituales.\n4. Anotar en una hoja sus síntomas (palpitaciones, mareos, dolor) con la hora exacta y sus actividades.\n5. Evitar mantas eléctricas y campos magnéticos fuertes.\n6. Usar ropa holgada; los hombres con mucho vello en el tórax deben rasurarse para fijar los electrodos.',
      },
      {
        name: 'Monitoreo Holter 14 días',
        description: 'Registro continuo del electrocardiograma durante 14 días.',
        indication:
          'INDICACIONES:\n1. Bañarse ANTES de la colocación: NO podrá hacerlo mientras porte el equipo.\n2. NO mojar el dispositivo ni los electrodos.\n3. Continuar con sus actividades habituales.\n4. Anotar en una hoja sus síntomas (palpitaciones, mareos, dolor) con la hora exacta y sus actividades.\n5. Evitar mantas eléctricas y campos magnéticos fuertes.\n6. Usar ropa holgada; los hombres con mucho vello en el tórax deben rasurarse para fijar los electrodos.',
      },
      {
        name: 'Revisión de Marcapasos',
        description: 'Interrogación y programación del marcapasos definitivo.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno.\n2. Llevar la tarjeta/carnet de identificación del dispositivo (marca y modelo).\n3. Llevar el reporte de la última revisión si la tiene.\n4. Usar ropa cómoda y de fácil retiro en la parte superior.',
      },
      {
        name: 'Revisión de Desfibriladores',
        description: 'Interrogación y programación del desfibrilador automático implantable (DAI).',
        indication:
          'INDICACIONES:\n1. No requiere ayuno.\n2. Llevar la tarjeta/carnet de identificación del dispositivo (marca y modelo).\n3. Llevar el reporte de la última revisión si la tiene.\n4. Usar ropa cómoda y de fácil retiro en la parte superior.',
      },
    ],
  },
  {
    section: 'Radiología',
    studies: [
      {
        name: 'Ultrasonido General de Abdomen',
        description: 'Ultrasonido de hígado, vesícula, vías biliares, páncreas, bazo y riñones.',
        indication:
          'INDICACIONES:\n1. Ayuno de 6 a 8 horas (indispensable para evaluar bien la vesícula y vías biliares).\n2. No consumir bebidas gaseosas el día previo.\n3. Puede tomar sus medicamentos habituales con un poco de agua, salvo indicación contraria.',
      },
      {
        name: 'Ultrasonido de Abdomen Superior',
        description: 'Ultrasonido enfocado en hígado, vesícula, vías biliares, páncreas y bazo.',
        indication:
          'INDICACIONES:\n1. Ayuno de 6 a 8 horas.\n2. No consumir bebidas gaseosas el día previo.',
      },
      {
        name: 'Ultrasonido Renal y de Vías Urinarias',
        description: 'Ultrasonido de riñones, uréteres y vejiga.',
        indication:
          'INDICACIONES:\n1. Asistir con la VEJIGA LLENA: tomar de 4 a 6 vasos de agua una hora antes del estudio y NO orinar.\n2. No requiere ayuno.',
      },
      {
        name: 'Ultrasonido Pélvico / Ginecológico (transabdominal)',
        description: 'Ultrasonido de útero, ovarios y vejiga por vía abdominal.',
        indication:
          'INDICACIONES:\n1. Asistir con la VEJIGA LLENA: tomar de 4 a 6 vasos de agua (aprox. 1 litro) una hora antes y NO orinar.\n2. No requiere ayuno.',
      },
      {
        name: 'Ultrasonido Pélvico Transvaginal',
        description: 'Ultrasonido ginecológico por vía transvaginal (mayor detalle de útero y ovarios).',
        indication:
          'INDICACIONES:\n1. Asistir con la VEJIGA VACÍA (orinar justo antes del estudio).\n2. No requiere ayuno.\n3. Estudio indicado en pacientes con vida sexual activa.',
      },
      {
        name: 'Ultrasonido Obstétrico',
        description: 'Ultrasonido de control del embarazo (evaluación fetal).',
        indication:
          'INDICACIONES:\n1. Primer trimestre: asistir con la vejiga llena (tomar agua 1 hora antes y no orinar).\n2. Segundo y tercer trimestre: no requiere preparación especial.\n3. Llevar ultrasonidos y controles prenatales previos.',
      },
      {
        name: 'Ultrasonido de Tiroides / Cuello',
        description: 'Ultrasonido de glándula tiroides y estructuras del cuello.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Evitar usar collares o cadenas el día del estudio.\n3. Usar ropa con cuello abierto o de fácil retiro.',
      },
      {
        name: 'Ultrasonido de Mama',
        description: 'Ultrasonido de glándulas mamarias y axilas.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno.\n2. NO aplicar talco, desodorante, cremas ni lociones en mamas o axilas el día del estudio.\n3. Llevar mamografías y ultrasonidos previos para comparación.',
      },
      {
        name: 'Ultrasonido Doppler de Miembros Inferiores',
        description: 'Ultrasonido Doppler venoso/arterial de las piernas.',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Usar ropa cómoda que permita descubrir ambas piernas.\n3. No aplicar cremas en las piernas el día del estudio.',
      },
      {
        name: 'Radiografía de Tórax',
        description: 'Radiografía simple de tórax (PA y lateral).',
        indication:
          'INDICACIONES:\n1. No requiere ayuno ni preparación especial.\n2. Retirar objetos metálicos del tórax (collares, cadenas) y la ropa con cierres o botones metálicos.\n3. Avisar al personal si está o podría estar embarazada.\n4. Llevar radiografías previas si las tiene.',
      },
      {
        name: 'Mamografía',
        description: 'Estudio radiológico de las mamas para tamizaje y diagnóstico.',
        indication:
          'INDICACIONES:\n1. NO aplicar talco, desodorante, cremas, perfumes ni lociones en mamas o axilas el día del estudio.\n2. De ser posible, programar el estudio la semana posterior a la menstruación (mamas menos sensibles).\n3. Llevar mamografías y ultrasonidos de mama previos para comparación.\n4. Avisar al personal si está o podría estar embarazada.',
      },
    ],
  },
]
