import React, { useState, useEffect } from "react";
import { db } from "../../firebaseconfig";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import {
  Paper, Typography, Grid, Box, Button, TextField, Card, CardContent, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemIcon, ListItemText
} from "@mui/material";
import { 
  UploadFile as UploadFileIcon, 
  EventNote as EventNoteIcon,
  Image as ImageIcon,
  CloudUpload as CloudUploadIcon,
  Upload as UploadIcon,
  Description as DescriptionIcon,
  Info as InfoIcon,
  InsertDriveFile as InsertDriveFileIcon,
  Storage as StorageIcon
} from "@mui/icons-material";

export default function DocumentosEmpresaForm() {
  const [currentStep, setCurrentStep] = useState("select");
  const [requiredDocuments, setRequiredDocuments] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('');
  
  const userCompanyData = JSON.parse(localStorage.getItem('userCompany') || '{}');
  const companyId = userCompanyData?.companyId;

  useEffect(() => {
    if (!companyId) return;
    const fetchDocuments = async () => {
      const requiredDocsQuery = query(collection(db, "requiredDocuments"), where("companyId", "==", companyId), where("entityType", "==", "company"));
      const uploadedDocsQuery = query(collection(db, "uploadedDocuments"), where("companyId", "==", companyId), where("entityType", "==", "company"));
      const [requiredSnap, uploadedSnap] = await Promise.all([getDocs(requiredDocsQuery), getDocs(uploadedDocsQuery)]);
      setRequiredDocuments(requiredSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setUploadedDocuments(uploadedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchDocuments();
  }, [companyId]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedDocument || !file) return;
    
    // Cerrar el diálogo de confirmación antes de iniciar la carga
    // Esto evita problemas de DOM cuando el componente se desmonta durante la operación
    setConfirmDialogOpen(false);
    
    // Indicar que estamos cargando
    setUploading(true);
    
    try {
      // Crear FormData y agregar el archivo
      const formData = new FormData();
      formData.append("file", file);
      
      // Realizar la petición al servidor
      const response = await fetch("http://localhost:3000/api/upload", { 
        method: "POST", 
        body: formData 
      });
      
      // Verificar si la respuesta es exitosa
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Error uploading file: ${errorData}`);
      }
      
      // Obtener los datos de la respuesta
      const responseData = await response.json();
      
      // Extraer la URL del archivo (corregido para manejar el formato de respuesta actual)
      const downloadURL = responseData.url?.url || responseData.url;
      
      if (!downloadURL) {
        throw new Error('URL de descarga no disponible en la respuesta');
      }
      
      // Obtener los datos del documento seleccionado
      const selectedDocData = requiredDocuments.find(doc => doc.id === selectedDocument);
      
      // Crear el objeto del nuevo documento
      const newDoc = {
        companyId,
        requiredDocumentId: selectedDocument,
        documentName: selectedDocData?.name || "Documento",
        entityType: "company", // Corregido de "Empresa" a "company" para mantener consistencia
        entityId: companyId,
        entityName: userCompanyData?.companyName || "Empresa",
        fileURL: downloadURL,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: serverTimestamp(),
        status: "Pendiente de revisión",
        comment: comment || "",
        expirationDate: calculateInitialExpirationDate(selectedDocData)
      };

      // Guardar el documento en Firestore
      await addDoc(collection(db, "uploadedDocuments"), newDoc);
      
      // Actualizar la UI para mostrar el documento recién subido
      setUploadedDocuments(prev => [...prev, {
        ...newDoc,
        id: 'temp-' + Date.now(), // ID temporal hasta que se recargue la página
        uploadedAt: { seconds: Date.now() / 1000 } // Simulamos el timestamp para la UI
      }]);
      
      // Reiniciar el formulario
      resetForm();
      
      // Mostrar mensaje de éxito
      alert('Documento subido correctamente');
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Error al subir el archivo: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const calculateInitialExpirationDate = (doc) => {
    if (!doc || !doc.deadline) return null;
    const now = new Date();
    if (doc.deadline.type === "custom") return doc.deadline.date;
    if (doc.deadline.type === "monthly") {
      now.setMonth(now.getMonth() + 1);
      return now.toISOString();
    }
    if (doc.deadline.type === "biannual") {
      now.setMonth(now.getMonth() + 6);
      return now.toISOString();
    }
    return null;
  };

  const resetForm = () => {
    setFile(null);
    setComment("");
    setSelectedDocument(null);
    setCurrentStep("select");
  };

  const handleBack = () => {
    setFile(null);
    setComment("");
    setCurrentStep("select");
  };

  return (
    <>
      {currentStep === "select" && (
        <DocumentSelectionStep
          documents={requiredDocuments}
          uploadedDocs={uploadedDocuments}
          onSelect={setSelectedDocument}
          onNext={() => setCurrentStep("upload")}
          selectedDocument={selectedDocument}
        />
      )}

      {currentStep === "upload" && selectedDocument && (
        <UploadStep
          selectedDocument={requiredDocuments.find(d => d.id === selectedDocument)}
          file={file}
          comment={comment}
          onFileChange={handleFileChange}
          onCommentChange={(e) => setComment(e.target.value)}
          onBack={handleBack}
          onSubmit={() => setConfirmDialogOpen(true)}
        />
      )}

      {confirmDialogOpen && (
        <Dialog 
          open={true} 
          onClose={() => !uploading && setConfirmDialogOpen(false)}
          disableEscapeKeyDown={uploading}
        >
          <DialogTitle>Confirmar envío</DialogTitle>
          <DialogContent>
            ¿Está seguro que desea subir este documento?
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={() => setConfirmDialogOpen(false)} 
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button 
              variant="contained" 
              onClick={handleUpload} 
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Subiendo...
                </>
              ) : (
                "Confirmar y Subir"
              )}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}


function DocumentSelectionStep({ documents, uploadedDocs, onSelect, onNext, selectedDocument }) {
  const getDaysToExpire = (doc) => {
    if (!doc.deadline?.date) return null;
    const diff = (new Date(doc.deadline.date) - new Date()) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  };

  const getBackgroundColor = (daysToExpire) => {
    if (daysToExpire === null) return "transparent";

    if (daysToExpire <= 0) return "rgba(244, 67, 54, 0.2)"; // Rojo muy fuerte (vencido)
    if (daysToExpire <= 1) return "rgba(244, 67, 54, 0.2)"; // 1 día o menos rojo
    if (daysToExpire <= 10) return "rgba(255, 152, 0, 0.2)"; // Naranja
    if (daysToExpire <= 20) return "rgba(255, 235, 59, 0.2)"; // Amarillo
    return "transparent";
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>Seleccione un documento</Typography>
      <Grid container spacing={2}>
        {documents.map(doc => {
          const daysToExpire = getDaysToExpire(doc);
          const isSelected = selectedDocument === doc.id;
          const bgColor = getBackgroundColor(daysToExpire);

          return (
            <Grid item xs={12} sm={6} md={4} key={doc.id}>
              <Card
                onClick={() => onSelect(doc.id)}
                sx={{
                  cursor: 'pointer',
                  border: isSelected ? '3px solid #1976d2' : '1px solid #ccc',
                  boxShadow: isSelected ? 6 : 1,
                  backgroundColor: bgColor,
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    boxShadow: 6,
                    borderColor: '#1976d2',
                  }
                }}
              >
               <CardContent>
  <Box display="flex" alignItems="center" mb={2}>
    <DescriptionIcon fontSize="large" color="primary" />
    <Typography 
      variant="h6" 
      fontWeight="bold" 
      ml={1}
      sx={{ 
        fontSize: '1.2rem',
        color: isSelected ? '#1976d2' : 'inherit'
      }}
    >
      {doc.name}
    </Typography>
  </Box>
  {doc.deadline?.date && (
    <Box mt={1}>
      <Typography 
        variant="subtitle1" 
        color="error" 
        fontWeight="bold"
        sx={{
          fontSize: '1rem',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          padding: '4px 8px',
          borderRadius: '4px',
          display: 'inline-block'
        }}
      >
        Vence: {new Date(doc.deadline.date).toLocaleDateString()}
      </Typography>
      {daysToExpire !== null && daysToExpire <= 10 && (
        <Typography 
          variant="caption" 
          display="block" 
          mt={1}
          color={daysToExpire <= 3 ? 'error' : 'warning.main'}
        >
          {daysToExpire <= 0 
            ? '¡Documento vencido!' 
            : `Faltan ${daysToExpire} día${daysToExpire !== 1 ? 's' : ''}`}
        </Typography>
      )}
    </Box>
  )}
</CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      <Box mt={3} display="flex" justifyContent="flex-end">
        <Button variant="contained" onClick={onNext} disabled={!selectedDocument}>Siguiente</Button>
      </Box>
    </Paper>
  );
}

function UploadStep({ selectedDocument, file, comment, onFileChange, onCommentChange, onBack, onSubmit }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('');

  const openPreview = (url, type) => {
    setPreviewUrl(url);
    setPreviewType(type);
    setPreviewOpen(true);
  };

  const daysToExpire = selectedDocument?.deadline?.date
    ? Math.floor((new Date(selectedDocument.deadline.date) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header + Controles */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight="bold" color="primary">
          Subir documento: {selectedDocument?.name}
        </Typography>
        
        {/* Fecha vencimiento */}
        {selectedDocument?.deadline?.date && (
          <Typography variant="subtitle1" color="error" mt={1}>
            Vence: {new Date(selectedDocument.deadline.date).toLocaleDateString()}
            {daysToExpire !== null && daysToExpire <= 10 && (
              <Typography component="span" ml={2} color={daysToExpire <= 0 ? 'error' : 'warning.main'}>
                {daysToExpire <= 0 ? '¡VENCIDO!' : `Faltan ${daysToExpire} días`}
              </Typography>
            )}
          </Typography>
        )}
        
        {/* Controles de subida */}
        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<UploadFileIcon />}
            sx={{ flex: 1 }}
          >
            Seleccionar Archivo
            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={onFileChange} />
          </Button>
          
          <TextField
            label="Comentario (opcional)"
            value={comment}
            onChange={onCommentChange}
            multiline
            rows={2}
            sx={{ flex: 2 }}
          />
        </Box>
      </Box>

      {/* Grid de ejemplos */}
      <Grid container spacing={3}>
        {/* Ejemplo de documento */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom display="flex" alignItems="center">
              <ImageIcon color="primary" sx={{ mr: 1 }} />
              Ejemplo de documento
            </Typography>
            <Box
              onClick={() => selectedDocument?.exampleImage && openPreview(selectedDocument.exampleImage, 'image')}
              sx={{
                border: '2px dashed #ccc',
                borderRadius: 2,
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: selectedDocument?.exampleImage ? 'pointer' : 'default',
                transition: '0.3s',
                '&:hover': { borderColor: selectedDocument?.exampleImage ? 'primary.main' : '#ccc' }
              }}
            >
              {selectedDocument?.exampleImage ? (
                <img src={selectedDocument.exampleImage} alt="Ejemplo" style={{ maxHeight: '90%', maxWidth: '90%' }} />
              ) : (
                <Typography color="text.secondary">No hay ejemplo disponible</Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Vista previa */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom display="flex" alignItems="center">
              <UploadIcon color="primary" sx={{ mr: 1 }} />
              {file ? 'Archivo seleccionado' : 'Selecciona un archivo'}
            </Typography>
            <Box
              onClick={() => {
                if (file) {
                  openPreview(URL.createObjectURL(file), file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : '');
                }
              }}
              sx={{
                border: '2px dashed #ccc',
                borderRadius: 2,
                height: 350,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: file ? 'pointer' : 'default',
                overflow: 'hidden'
              }}
            >
              {file ? (
                file.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(file)} alt="Archivo" style={{ maxHeight: '90%',objectFit: 'contain', maxWidth: '90%' }} />
                ) : file.type === 'application/pdf' ? (
                  <iframe src={URL.createObjectURL(file)} title="PDF" width="100%" height="100%" style={{ border: 'none',minHeight: '350px' }} />
                ) : (
                  <DescriptionIcon fontSize="large" />
                )
              ) : (
                <Box textAlign="center">
                  <CloudUploadIcon fontSize="large" color="disabled" />
                  <Typography mt={1} color="text.secondary">Sin archivo aún</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Botones de acción */}
      <Box display="flex" justifyContent="space-between" mt={4}>
        <Button variant="outlined" onClick={onBack} sx={{ width: '48%' }}>
          Volver
        </Button>
        <Button 
          variant="contained" 
          onClick={onSubmit} 
          disabled={!file}
          sx={{ width: '48%' }}
        >
          Confirmar
        </Button>
      </Box>

      {/* Modal de vista previa */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <Box p={2}>
          {previewType === 'image' ? (
            <img src={previewUrl} alt="Vista previa" style={{ width: '100%', height: 'auto' }} />
          ) : previewType === 'pdf' ? (
            <iframe src={previewUrl} title="Vista previa PDF" width="100%" height="600px" style={{ border: 'none' }} />
          ) : (
            <Typography>No se puede previsualizar este archivo.</Typography>
          )}
        </Box>
      </Dialog>
    </Paper>
  );
}

export { UploadStep };
