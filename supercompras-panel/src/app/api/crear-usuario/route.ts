import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1. Inicializamos el cliente admin con las credenciales
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2. Exportamos la función POST (¡Fijate que NO dice "default" en ningún lado!)
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Creamos el usuario en Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, 
    });

    if (error) throw error;

    return NextResponse.json({ success: true, user: data.user });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}