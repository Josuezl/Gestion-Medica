const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { query: `
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 15;
    ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
    ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'));
  ` })
  console.log({ data, error })
}
run()
