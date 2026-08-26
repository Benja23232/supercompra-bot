import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Inicializamos el cliente admin con las credenciales
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    // 1. AHORA RECIBIMOS EL ROL TAMBIÉN
    const { email, password, rol } = await req.json(); 

    // 2. Creamos el usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, 
    });

    if (authError) throw authError;

    // 3. GUARDAMOS EL ROL EN TU TABLA DE ROLES
    // Asumo que la tabla 'roles' tiene las columnas 'email' y 'rol'
    const { error: roleError } = await supabaseAdmin
      .from('roles')
      .insert([{ email: email, rol: rol || 'empleado' }]);

    if (roleError) throw roleError;

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}