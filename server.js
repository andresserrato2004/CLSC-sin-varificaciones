const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
require('dotenv').config(); 
const path = require('path');
const fs = require('fs');


const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

const s3 = new AWS.S3({
    aws_access_key_id: 'AKIA3IDL3SADSADUNFIUEW74WH',
    aws_secret_access_key: 'F9dOXRZc8dSASDfGQZmBf47v22Bt7PmjaqccUcQdNSD',
    aws_region: 'us-east-1'
    
});

const AWS_BUCKET_NAME = 'demo-tecnica-clsc';

const DB_PATH = path.join(__dirname, 'database.json');

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) return [];
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (err) {
        console.error('Error leyendo DB:', err);
        return [];
    }
}

function writeDB(arr) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(arr, null, 2));
    } catch (err) {
        console.error('Error escribiendo DB:', err);
        throw err;
    }
}

// Endpoint para listar inventario (lee desde database.json)
app.get('/api/inventory', (req, res) => {
    const db = readDB();
    res.json(db);
});



// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para aplicaciones SPA: servir index.html en rutas no reconocidas (GET)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /api/upload (ya definido arriba — la ruta real es la que sigue abajo)
app.post('/api/upload', (req, res) => {
    const { id, item, owner, image, imageBase64 } = req.body || {};

    const userData = {
        id: id || Date.now(),
        item: item || 'Sin nombre',
        owner: owner || 'Desconocido',
        image: image || null,
        timestamp: new Date().toISOString()
    };

    // 1) Guardar en database.json
    const db = readDB();
    db.push(userData);
    try {
        writeDB(db);
    } catch (err) {
        return res.status(500).json({ error: 'Error guardando en DB local' });
    }

    // 2) Si se envía imageBase64, subir a S3 y actualizar registro
    if (imageBase64) {
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(imageBase64, 'base64');
        } catch (err) {
            return res.status(400).json({ error: 'imageBase64 no es válida' });
        }

        const params = {
            Bucket: AWS_BUCKET_NAME,
            Key: `inventory/photo_${userData.id}.jpg`,
            Body: imageBuffer,
            ContentType: 'image/jpeg'
        };

        s3.upload(params, (err, data) => {
            if (err) {
                console.error('Error en S3:', err);
                return res.status(500).json({ error: err.message });
            }

            // actualizar el registro en database.json con la URL devuelta
            const current = readDB();
            const idx = current.findIndex(x => String(x.id) === String(userData.id));
            if (idx !== -1) {
                current[idx].image = data.Location;
                try { writeDB(current); } catch (e) { console.error('Error actualizando DB con URL:', e); }
            }

            return res.status(201).json({
                message: 'Registro completo: Datos guardados en BD local y foto en S3',
                url: data.Location
            });
        });

        return;
    }

    // Si sólo había una URL en `image`, ya está guardado en DB
    return res.status(201).json({ message: 'Item registrado en inventario (persistente)', item: userData });
});

    // Iniciar servidor
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });