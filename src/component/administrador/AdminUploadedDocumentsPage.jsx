// Archivo: AdminUploadedDocumentsPage.jsx - Versión mejorada con funcionalidades de edición

import React, { useEffect, useState, useContext } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Collapse, Button, TextField, Alert, CircularProgress, Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Tooltip } from '@mui/material';
import { ExpandMore, ExpandLess, CheckCircle, Cancel, Download, Edit, Visibility, FiberManualRecord } from '@mui/icons-material';
import { db, auth } from '../../firebaseconfig';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useCompany } from '../../contexts/company-context';
import { AuthContext } from '../../context/AuthContext';

export default function AdminUploadedDocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newExpirationDates, setNewExpirationDates] = useState({});
  const [adminComments, setAdminComments] = useState({});
  const [viewFileUrl, setViewFileUrl] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [viewFileName, setViewFileName] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [editMode, setEditMode] = useState({});
  const [showSemaphoreInfo, setShowSemaphoreInfo] = useState(false);

  const { selectedCompanyId } = useCompany();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    const fetchDocuments = async () => {
      setLoading(true);
      try {
        const docsQuery = selectedCompanyId
          ? query(collection(db, 'uploadedDocuments'), where('companyId', '==', selectedCompanyId))
          : collection(db, 'uploadedDocuments');

        const snapshot = await getDocs(docsQuery);
        const companiesSnapshot = await getDocs(collection(db, 'companies'));
        const companiesMap = {};
        companiesSnapshot.forEach(doc => {
          companiesMap[doc.id] = doc.data().name;
        });

        const loadedDocuments = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let requiredDoc = null;
          if (data.requiredDocumentId) {
            const requiredDocSnap = await getDoc(doc(db, 'requiredDocuments', data.requiredDocumentId));
            requiredDoc = requiredDocSnap.exists() ? requiredDocSnap.data() : null;
          }
          
          // Calcular días restantes para documentos con fecha de vencimiento
          let daysRemaining = null;
          if (data.expirationDate) {
            const today = new Date();
            let expiryDate;
            
            if (typeof data.expirationDate === 'string') {
              expiryDate = new Date(data.expirationDate);
            } else if (data.expirationDate.seconds) {
              expiryDate = new Date(data.expirationDate.seconds * 1000);
            }
            
            if (expiryDate) {
              const diffTime = expiryDate - today;
              daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
          }
          
          return {
            id: docSnap.id,
            ...data,
            companyName: companiesMap[data.companyId] || data.companyId,
            requiredDocument: requiredDoc,
            daysRemaining: daysRemaining
          };
        }));
        
        // Ordenar documentos: primero pendientes, luego aprobados por fecha de vencimiento
        const sortedDocuments = loadedDocuments.sort((a, b) => {
          // Primero los pendientes
          if (a.status === 'Pendiente de revisión' && b.status !== 'Pendiente de revisión') return -1;
          if (a.status !== 'Pendiente de revisión' && b.status === 'Pendiente de revisión') return 1;
          
          // Si ambos son aprobados, ordenar por días restantes (menor a mayor)
          if (a.status === 'Aprobado' && b.status === 'Aprobado') {
            // Si alguno no tiene días restantes, ponerlo al final
            if (a.daysRemaining === null && b.daysRemaining !== null) return 1;
            if (a.daysRemaining !== null && b.daysRemaining === null) return -1;
            if (a.daysRemaining === null && b.daysRemaining === null) return 0;
            
            // Ordenar por días restantes (menor a mayor)
            return a.daysRemaining - b.daysRemaining;
          }
          
          // Si uno es aprobado y otro rechazado, mostrar aprobados primero
          if (a.status === 'Aprobado' && b.status === 'Rechazado') return -1;
          if (a.status === 'Rechazado' && b.status === 'Aprobado') return 1;
          
          // Para otros casos, mantener el orden original
          return 0;
        });

        setDocuments(sortedDocuments);
      } catch (err) {
        console.error(err);
        setError('Error al cargar documentos.');
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [selectedCompanyId]);

  const handleExpandRow = (id) => {
    setExpandedRow(prev => (prev === id ? null : id));
  };

  const handleDownload = async (url, filename) => {
    if (!url) {
      setToastMessage('No se encontró el archivo para descargar.');
      setToastOpen(true);
      return;
    }
  
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('No se pudo descargar el archivo');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
  
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'documento';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
  
      setToastMessage('Descarga iniciada ✅');
      setToastOpen(true);
    } catch (error) {
      console.error('Error al descargar archivo:', error);
      setToastMessage('Error al descargar el archivo.');
      setToastOpen(true);
    }
  };


  const handleViewFile = (url, filename) => {
    setViewFileUrl(url);
    setViewFileName(filename);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setViewFileUrl('');
    setViewFileName('');
    setOpenDialog(false);
  };

  const handleApprove = async (docId) => {
    const expirationDate = newExpirationDates[docId];
    if (!expirationDate) {
      setToastMessage('Debe ingresar una fecha de vencimiento para aprobar.');
      setToastOpen(true);
      return;
    }
    try {
      const adminEmail = user?.email || auth.currentUser?.email || 'Administrador';
      await updateDoc(doc(db, 'uploadedDocuments', docId), {
        status: 'Aprobado',
        expirationDate,
        reviewedAt: serverTimestamp(),
        reviewedBy: adminEmail
      });
      setDocuments(prev => prev.map(doc => doc.id === docId ? { 
        ...doc, 
        status: 'Aprobado', 
        expirationDate,
        reviewedBy: adminEmail,
        reviewedAt: { seconds: Date.now() / 1000 }
      } : doc));
      setExpandedRow(null);
      setEditMode(prev => ({ ...prev, [docId]: false }));
      setToastMessage('Documento aprobado correctamente');
      setToastOpen(true);
    } catch (error) {
      console.error('Error al aprobar documento:', error);
      setToastMessage('Error al aprobar documento');
      setToastOpen(true);
    }
  };

  const handleReject = async (docId) => {
    const comment = adminComments[docId];
    if (!comment) {
      setToastMessage('Debe ingresar un comentario para rechazar.');
      setToastOpen(true);
      return;
    }
    try {
      const adminEmail = user?.email || auth.currentUser?.email || 'Administrador';
      await updateDoc(doc(db, 'uploadedDocuments', docId), {
        status: 'Rechazado',
        adminComment: comment,
        reviewedAt: serverTimestamp(),
        reviewedBy: adminEmail
      });
      setDocuments(prev => prev.map(doc => doc.id === docId ? { 
        ...doc, 
        status: 'Rechazado', 
        adminComment: comment,
        reviewedBy: adminEmail,
        reviewedAt: { seconds: Date.now() / 1000 }
      } : doc));
      setExpandedRow(null);
      setEditMode(prev => ({ ...prev, [docId]: false }));
      setToastMessage('Documento rechazado correctamente');
      setToastOpen(true);
    } catch (error) {
      console.error('Error al rechazar documento:', error);
      setToastMessage('Error al rechazar documento');
      setToastOpen(true);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    if (typeof date === 'string') return new Date(date).toLocaleDateString();
    if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString();
    return '-';
  };
  
  // Función para determinar el color del semáforo según los días restantes
  const getSemaphoreColor = (days) => {
    if (days === null) return 'default';
    if (days <= 0) return 'error'; // Rojo - Vencido
    if (days <= 7) return 'warning'; // Amarillo - Próximo a vencer
    return 'success'; // Verde - En tiempo
  };
  
  // Función para obtener el texto del estado de vencimiento
  const getExpiryStatusText = (days) => {
    if (days === null) return '';
    if (days <= 0) return 'Vencido';
    if (days <= 7) return 'Próximo a vencer';
    return 'Vigente';
  };

  const handleToggleEditMode = (docId) => {
    setEditMode(prev => {
      const newState = { ...prev, [docId]: !prev[docId] };
      // Inicializar campos de edición si entramos en modo edición
      if (newState[docId]) {
        const doc = documents.find(d => d.id === docId);
        if (doc) {
          // Inicializar fecha de vencimiento si existe
          if (doc.expirationDate) {
            let formattedDate;
            if (typeof doc.expirationDate === 'string') {
              formattedDate = doc.expirationDate.split('T')[0]; // Formato YYYY-MM-DD
            } else if (doc.expirationDate.seconds) {
              const date = new Date(doc.expirationDate.seconds * 1000);
              formattedDate = date.toISOString().split('T')[0];
            }
            setNewExpirationDates(prev => ({ ...prev, [docId]: formattedDate }));
          }
          // Inicializar comentario si existe
          if (doc.adminComment) {
            setAdminComments(prev => ({ ...prev, [docId]: doc.adminComment }));
          }
        }
      }
      return newState;
    });
  };

  if (loading) return <Box textAlign="center"><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Documentos Subidos</Typography>
        <Button 
          variant="outlined" 
          size="small" 
          onClick={() => setShowSemaphoreInfo(!showSemaphoreInfo)}
        >
          {showSemaphoreInfo ? 'Ocultar leyenda' : 'Ver leyenda de semáforo'}
        </Button>
      </Box>
      
      {showSemaphoreInfo && (
        <Paper sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle1">Leyenda del semáforo de vencimiento:</Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FiberManualRecord color="error" sx={{ mr: 1 }} />
              <Typography variant="body2">Vencido (0 días o menos)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FiberManualRecord color="warning" sx={{ mr: 1 }} />
              <Typography variant="body2">Próximo a vencer (7 días o menos)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FiberManualRecord color="success" sx={{ mr: 1 }} />
              <Typography variant="body2">Vigente (más de 7 días)</Typography>
            </Box>
          </Box>
        </Paper>
      )}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Empresa</TableCell>
              <TableCell>Documento</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Subido</TableCell>
              <TableCell>Vencimiento</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents.map((doc) => (
              <React.Fragment key={doc.id}>
                <TableRow>
                  <TableCell>{doc.companyName}</TableCell>
                  <TableCell>{doc.documentName || 'Sin nombre'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Chip
                        label={doc.status || 'Pendiente'}
                        color={doc.status === 'Aprobado' ? 'success' : doc.status === 'Rechazado' ? 'error' : 'warning'}
                        size="small"
                      />
                      {doc.reviewedBy && (
                        <Typography variant="caption" sx={{ mt: 1 }}>
                          Por: {doc.reviewedBy}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                  <TableCell>
                    {doc.status === 'Aprobado' && doc.daysRemaining !== null ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {formatDate(doc.expirationDate)}
                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                          <FiberManualRecord 
                            sx={{ 
                              color: theme => theme.palette[getSemaphoreColor(doc.daysRemaining)].main,
                              fontSize: '1rem',
                              mr: 0.5
                            }} 
                          />
                          <Chip 
                            size="small" 
                            label={`${doc.daysRemaining} días - ${getExpiryStatusText(doc.daysRemaining)}`}
                            color={getSemaphoreColor(doc.daysRemaining)}
                          />
                        </Box>
                      </Box>
                    ) : (
                      formatDate(doc.expirationDate)
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <Tooltip title="Ver detalles">
                        <IconButton onClick={() => handleExpandRow(doc.id)}>
                          {expandedRow === doc.id ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar estado">
                        <IconButton onClick={() => handleToggleEditMode(doc.id)} color="primary">
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell style={{ padding: 0 }} colSpan={6}>
                    <Collapse in={expandedRow === doc.id} timeout="auto" unmountOnExit>
                      <Box margin={2}>
                        <Typography variant="h6">Detalles del Documento</Typography>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                          <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2">Archivo Subido:</Typography>
                            {doc.fileURL ? (
                              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Button 
                                  variant="outlined" 
                                  onClick={() => handleViewFile(doc.fileURL, doc.fileName)}
                                  startIcon={<Visibility />}
                                >
                                  Ver Archivo
                                </Button>
                                <Button 
                                  variant="contained" 
                                  onClick={() => handleDownload(doc.fileURL, doc.fileName)} 
                                  startIcon={<Download />}
                                >
                                  Descargar
                                </Button>
                              </Box>
                            ) : (
                              <Typography variant="body2">No disponible</Typography>
                            )}
                          </Grid>
                          
                          {editMode[doc.id] && (
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>Cambiar estado:</Typography>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <TextField
                                  label="Fecha de vencimiento"
                                  type="date"
                                  value={newExpirationDates[doc.id] || ''}
                                  onChange={(e) => setNewExpirationDates(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                  InputLabelProps={{ shrink: true }}
                                  fullWidth
                                  size="small"
                                  helperText="Requerido para aprobar el documento"
                                />
                                <TextField
                                  label="Comentario del administrador"
                                  multiline
                                  rows={3}
                                  value={adminComments[doc.id] || ''}
                                  onChange={(e) => setAdminComments(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                  fullWidth
                                  size="small"
                                  helperText="Requerido para rechazar el documento"
                                />
                                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                  <Button
                                    variant="contained"
                                    color="success"
                                    startIcon={<CheckCircle />}
                                    onClick={() => handleApprove(doc.id)}
                                  >
                                    Aprobar
                                  </Button>
                                  <Button
                                    variant="contained"
                                    color="error"
                                    startIcon={<Cancel />}
                                    onClick={() => handleReject(doc.id)}
                                  >
                                    Rechazar
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    onClick={() => handleToggleEditMode(doc.id)}
                                  >
                                    Cancelar
                                  </Button>
                                </Box>
                              </Box>
                            </Grid>
                          )}
                          
                          {doc.reviewedAt && !editMode[doc.id] && (
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle2">Información de revisión:</Typography>
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                  <strong>Revisado por:</strong> {doc.reviewedBy || 'Administrador'}
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Fecha de revisión:</strong> {formatDate(doc.reviewedAt)}
                                </Typography>
                                {doc.status === 'Aprobado' && (
                                  <>
                                    <Typography variant="body2">
                                      <strong>Fecha de vencimiento:</strong> {formatDate(doc.expirationDate)}
                                    </Typography>
                                    {doc.daysRemaining !== null && (
                                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                        <strong>Estado:</strong>
                                        <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                                          <FiberManualRecord 
                                            sx={{ 
                                              color: theme => theme.palette[getSemaphoreColor(doc.daysRemaining)].main,
                                              fontSize: '0.8rem',
                                              mr: 0.5
                                            }} 
                                          />
                                          <Typography variant="body2">
                                            {doc.daysRemaining} días - {getExpiryStatusText(doc.daysRemaining)}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    )}
                                  </>
                                )}
                                {doc.adminComment && (
                                  <Typography variant="body2">
                                    <strong>Comentario:</strong> {doc.adminComment}
                                  </Typography>
                                )}
                                <Button 
                                  variant="outlined" 
                                  color="primary" 
                                  sx={{ mt: 1 }}
                                  onClick={() => handleToggleEditMode(doc.id)}
                                >
                                  Cambiar estado
                                </Button>
                              </Box>
                            </Grid>
                          )}
                        </Grid>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Vista Previa del Archivo</DialogTitle>
        <DialogContent>
          {viewFileUrl && (
            <iframe src={viewFileUrl} title="Vista previa" style={{ width: '100%', height: '80vh', border: 'none' }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">Cerrar</Button>
          <Button onClick={() => handleDownload(viewFileUrl, viewFileName)} startIcon={<Download />}>Descargar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        message={toastMessage || "Operación completada con éxito ✅"}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
