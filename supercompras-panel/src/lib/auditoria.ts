import { supabase } from '@/lib/supabase';

// Esta función la vamos a poder usar desde cualquier parte del sistema
export async function logAuditoria(modulo: string, accion: string, detalles: string = '') {
  try {
    // Busca quién es el usuario directamente de la memoria del navegador
    const emailUsuario = localStorage.getItem('emailUsuario') || 'Usuario Desconocido';
    
    const { error } = await supabase.from('auditorias').insert([
      {
        email_usuario: emailUsuario,
        modulo: modulo,
        accion: accion,
        detalles: detalles
      }
    ]);

    if (error) {
      console.error("Error guardando auditoría:", error);
    }
  } catch (error) {
    console.error("Error inesperado en auditoría:", error);
  }
}