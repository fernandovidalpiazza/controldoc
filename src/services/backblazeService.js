// backblazeService.js - Servicio mejorado para Backblaze B2

import axios from 'axios';

const DEBUG_MODE = true; // Siempre mostrar logs para depuración

let authData = null;
let lastAuthTime = 0;
const AUTH_TIMEOUT = 23 * 60 * 60 * 1000; // 23 horas en milisegundos (el token expira a las 24h)

// Credenciales de prueba para desarrollo (reemplazar con las reales en producción)
const DEV_CREDENTIALS = {
  keyId: '003e2b6e5e7f9d40000000001',
  applicationKey: 'K003KJ+RJLQAvLy6UrVVGLIj5pAHI5Y',
  bucketId: '4e2b6e5e7f9d4b0cb27e1234',
  bucketName: 'controldocc'
};

/**
 * Inicializa la autenticación con Backblaze B2
 * @returns {Promise<Object>} Datos de autenticación
 */
export async function initB2() {
  try {
    // Verificar si ya tenemos una autenticación válida
    const now = Date.now();
    if (authData && (now - lastAuthTime) < AUTH_TIMEOUT) {
      console.log('Usando autenticación existente de B2');
      return authData;
    }
    
    // Usar credenciales de desarrollo si no hay variables de entorno
    const keyId = process.env.B2_KEY_ID || DEV_CREDENTIALS.keyId;
    const applicationKey = process.env.B2_APPLICATION_KEY || DEV_CREDENTIALS.applicationKey;
    
    console.log('Iniciando autenticación con B2 usando:', keyId);
    
    const response = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      auth: {
        username: keyId,
        password: applicationKey
      }
    });
    
    authData = response.data;
    lastAuthTime = now;
    
    console.log('Autenticación B2 exitosa:', {
      apiUrl: authData.apiUrl,
      downloadUrl: authData.downloadUrl,
      timestamp: new Date().toISOString()
    });
    
    return authData;
  } catch (error) {
    console.error('Error inicializando B2:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(`Error de autenticación con Backblaze B2: ${error.message}`);
  }
}

/**
 * Sube un archivo a Backblaze B2
 * @param {Buffer} fileBuffer - Buffer del archivo a subir
 * @param {string} fileName - Nombre del archivo incluyendo ruta
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} sha1 - Hash SHA1 del archivo (opcional)
 * @returns {Promise<Object>} Objeto con la URL del archivo
 */
export async function uploadFile(fileBuffer, fileName, mimeType, sha1 = 'do_not_verify') {
  try {
    // Asegurar que tenemos autenticación válida
    if (!authData) await initB2();
    
    // Validaciones básicas
    if (!fileBuffer || !fileName) {
      throw new Error('Se requiere buffer de archivo y nombre de archivo');
    }
    
    if (!sha1 || typeof sha1 !== 'string') {
      sha1 = 'do_not_verify';
    }
    
    // Obtener el ID del bucket (de variables de entorno o credenciales de desarrollo)
    const bucketId = process.env.B2_BUCKET_ID || DEV_CREDENTIALS.bucketId;
    
    console.log('Solicitando URL de subida para bucket:', bucketId);
    
    // Obtener URL de subida
    const uploadResponse = await axios.post(
      `${authData.apiUrl}/b2api/v2/b2_get_upload_url`,
      { bucketId },
      { headers: { Authorization: authData.authorizationToken } }
    );
    
    const { uploadUrl, authorizationToken } = uploadResponse.data;
    
    console.log('URL de subida obtenida:', uploadUrl.substring(0, 30) + '...');
    
    // Subir el archivo con Content-Disposition: attachment
    const response = await axios.post(uploadUrl, fileBuffer, {
      headers: {
        Authorization: authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': mimeType,
        'X-Bz-Content-Sha1': sha1,
        'Content-Length': fileBuffer.length,
        'X-Bz-Info-Content-Disposition': `attachment; filename="${fileName}"`
      }
    });

    console.log('Archivo subido exitosamente:', {
      fileId: response.data.fileId,
      fileName: response.data.fileName
    });

    // Obtener nombre del bucket (de variables de entorno o credenciales de desarrollo)
    const bucketName = process.env.B2_BUCKET_NAME || DEV_CREDENTIALS.bucketName;
    const encodedFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    
    // Construir URL pública
    const fileUrl = `https://${authData.downloadUrl.split('/')[2]}/file/${bucketName}/${encodedFileName}`;
    
    console.log('URL generada:', fileUrl);
    
    // Devolver la URL
    return { url: fileUrl };
  } catch (error) {
    console.error('Error al subir archivo:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Reautenticar si recibimos un error 401
    if (error.response?.status === 401) {
      console.log('Credenciales expiradas, reautenticando...');
      authData = null; // Forzar reautenticación en el próximo intento
      throw new Error('Credenciales expiradas. Por favor, intente nuevamente.');
    }
    
    throw error;
  }
}
