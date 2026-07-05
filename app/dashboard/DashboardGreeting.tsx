import React from 'react'
import { getDashboardGreetingData } from './greeting-data'

/**
 * Banner de saludo del dashboard: saludo por hora de Honduras + nombre (con título si es médico),
 * subtítulo con citas del día (médicos) o por aprobar (personal), y tres métricas del día.
 * Componente de servidor; se renderiza arriba de la agenda.
 */
export default async function DashboardGreeting() {
  const data = await getDashboardGreetingData()
  if (!data) return null

  const { greeting, name, isDoctor, todayCount, stats } = data
  const citaWord = todayCount === 1 ? 'cita' : 'citas'
  const subtitle = isDoctor
    ? `Tienes ${todayCount} ${citaWord} hoy`
    : `${todayCount} ${citaWord} por aprobar`

  return (
    <section style={styles.banner}>
      <div style={styles.left}>
        {/* <div> en vez de <h2>/<p>: el dashboard fuerza color oscuro !important en h1–h6/p. */}
        <div style={styles.greeting}>
          {greeting}, {name}
        </div>
        <div style={styles.subtitle}>· {subtitle}</div>
      </div>

      <div style={styles.stats}>
        {/* Médicos: sus consultas (completadas + pendientes) + las del centro. Personal: solo el centro. */}
        {isDoctor && stats.completedPersonal !== null && (
          <Stat value={stats.completedPersonal} label="Consultas completadas" />
        )}
        {isDoctor && stats.pendingPersonal !== null && (
          <Stat value={stats.pendingPersonal} label="Consultas pendientes" divider />
        )}
        <Stat
          value={stats.completedCenter}
          label={isDoctor ? 'Consultas del centro' : 'Consultas completadas'}
          divider={isDoctor}
        />
        <Stat value={stats.newPatients} label="Pacientes nuevos" divider />
        <Stat value={stats.totalPatients} label="Total de pacientes" divider />
      </div>
    </section>
  )
}

function Stat({ value, label, divider }: { value: number; label: string; divider?: boolean }) {
  return (
    <div style={{ ...styles.stat, ...(divider ? styles.statDivider : null) }}>
      <div style={styles.statValue}>{value.toLocaleString('en-US')}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1.5rem',
    padding: '1.5rem 2rem',
    marginBottom: '1.5rem',
    borderRadius: '16px',
    background: 'linear-gradient(115deg, hsl(214, 80%, 46%) 0%, hsl(190, 72%, 40%) 55%, hsl(173, 80%, 38%) 100%)',
    color: '#fff',
    boxShadow: '0 10px 25px -10px rgba(13, 148, 136, 0.45)',
  },
  left: {
    flex: '1 1 260px',
    minWidth: 0,
  },
  greeting: {
    margin: 0,
    fontSize: '1.6rem',
    fontWeight: 800,
    lineHeight: 1.2,
    color: '#fff',
  },
  subtitle: {
    margin: '0.4rem 0 0',
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.85)',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  stat: {
    padding: '0 1.1rem',
    textAlign: 'center',
    minWidth: '84px',
  },
  statDivider: {
    borderLeft: '1px solid rgba(255,255,255,0.25)',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 800,
    lineHeight: 1,
    color: '#fff',
  },
  statLabel: {
    marginTop: '0.4rem',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.85)',
    whiteSpace: 'nowrap',
  },
}
