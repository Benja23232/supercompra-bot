import { NextResponse, NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        const response = await fetch(`${process.env.SERVER_URL || 'http://localhost:3000'}/api/difusion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error en API route de difusión:", error);
        return NextResponse.json({ success: false, error: "Error al procesar la difusión" }, { status: 500 });
    }
}