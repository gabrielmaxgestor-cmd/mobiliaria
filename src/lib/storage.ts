import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
} from "firebase/storage";
import { getFirebaseApp } from "./firebase";

let storage: FirebaseStorage;

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}

/**
 * Faz upload de uma foto de imóvel para o caminho: /imoveis/{imovelId}/fotos/{fileName}
 */
export async function uploadPropertyPhoto(
  imovelId: string,
  file: File | Blob,
  fileName: string
): Promise<string> {
  const st = getFirebaseStorage();
  const safeName = `${Date.now()}_${fileName.replace(/\s+/g, "_")}`;
  const fileRef = ref(st, `imoveis/${imovelId}/fotos/${safeName}`);

  const snapshot = await uploadBytes(fileRef, file, {
    contentType: file instanceof File ? file.type : "image/jpeg",
  });
  return await getDownloadURL(snapshot.ref);
}

/**
 * Faz upload da planta baixa para o caminho: /imoveis/{imovelId}/planta/{fileName}
 */
export async function uploadPropertyFloorPlan(
  imovelId: string,
  file: File | Blob,
  fileName: string
): Promise<string> {
  const st = getFirebaseStorage();
  const safeName = `${Date.now()}_${fileName.replace(/\s+/g, "_")}`;
  const fileRef = ref(st, `imoveis/${imovelId}/planta/${safeName}`);

  const snapshot = await uploadBytes(fileRef, file, {
    contentType: file instanceof File ? file.type : "application/pdf",
  });
  return await getDownloadURL(snapshot.ref);
}

/**
 * Remove um arquivo do Storage a partir de sua URL
 */
export async function deleteStorageFileByUrl(fileUrl: string): Promise<void> {
  try {
    const st = getFirebaseStorage();
    const fileRef = ref(st, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn("Aviso ao deletar arquivo do Storage:", error);
  }
}
