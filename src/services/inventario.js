const { pool } = require('./db');

const obtenerProductosParaCatalogo = async () => {
    try {
        const query = 'SELECT id_producto AS id, nombre AS title, precio AS price FROM productos';
        const result = await pool.query(query);
        
        // Formateamos para que Meta no se queje de "Incompleto"
        return result.rows.map(p => ({
            ...p,
            price: `${p.price} ARS`,
            availability: 'in stock',
            condition: 'new'
        }));
    } catch (err) {
        console.error('Error al obtener productos para catálogo:', err);
        return [];
    }
};

module.exports = { obtenerProductosParaCatalogo };