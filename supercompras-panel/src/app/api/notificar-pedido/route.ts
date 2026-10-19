import { NextResponse, NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Esto le avisa a tu servidor Node.js/Express que mande el WhatsApp
        const response = await fetch(`${process.env.SERVER_URL || 'http://localhost:3000'}/api/notificar-pedido`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error en API route de notificación:", error);
        return NextResponse.json({ success: false, error: "Error al procesar la notificación" }, { status: 500 });
    }
}