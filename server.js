import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { uploadFile } from './src/services/backblazeService.js';
import { config } from 'dotenv';

// Cargar variables de entorno
config({ path: '.env' });

// Credenciales de prueba para desarrollo (las mismas que en backblazeService.js)
const DEV_CREDENTIALS = {
  keyId: '003e2b6e5e7f9d40000000001',
  applicationKey: 'K003KJ+RJLQAvLy6UrVVGLIj5pAHI5Y',
  bucketId: '4e2b6e5e7f9d4b0cb27e1234',
  bucketName: 'controldocc'
};

// Asignar credenciales de desarrollo si no existen en el entorno
if (!process.env.B2_KEY_ID) process.env.B2_KEY_ID = DEV_CREDENTIALS.keyId;
if (!process.env.B2_APPLICATION_KEY) process.env.B2_APPLICATION_KEY = DEV_CREDENTIALS.applicationKey;
if (!process.env.B2_BUCKET_ID) process.env.B2_BUCKET_ID = DEV_CREDENTIALS.bucketId;
if (!process.env.B2_BUCKET_NAME) process.env.B2_BUCKET_NAME = DEV_CREDENTIALS.bucketName;

console.log('[DEBUG] Variables de entorno cargadas:', {
  key: process.env.B2_KEY_ID,
  appKey: process.env.B2_APPLICATION_KEY?.substring(0, 6) + '...',
  bucket: process.env.B2_BUCKET_ID,
  bucketName: process.env.B2_BUCKET_NAME
});

// Inicializar Express
const app = express();
const upload = multer();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Archivo recibido:', req.file?.originalname || 'No hay archivo'); // Log para depuración

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    // Verificar que tenemos las variables de entorno necesarias
    if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_BUCKET_ID) {
      console.error('Error: Faltan variables de entorno para Backblaze B2');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    // Convertir a buffer si es necesario
    const fileBuffer = req.file.buffer instanceof Buffer 
      ? req.file.buffer 
      : Buffer.from(req.file.buffer);

    // Generar un nombre de archivo único para evitar colisiones
    const timestamp = Date.now();
    const uniqueFileName = `documentExamples/${timestamp}_${req.file.originalname}`;
    
    // Subir el archivo a Backblaze
    const result = await uploadFile(
      fileBuffer,
      uniqueFileName,
      req.file.mimetype
    );
    
    // Verificar que tenemos una URL válida
    if (!result || !result.url) {
      throw new Error('No se pudo obtener la URL del archivo subido');
    }
    
    // Devolver la URL al cliente
    res.json({ url: result.url });
  } catch (error) {
    console.error('Error en upload:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

app.listen(port, () => {
  console.log(`Servidor backend en http://localhost:${port}`);
});