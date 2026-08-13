import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const projectsRef = collection(db, 'projects');

function toPlainProject(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    uid: data.uid,
    authorName: data.authorName || 'Unknown',
    title: data.title || '',
    summary: data.summary || '',
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    repoUrl: data.repoUrl || '',
    liveUrl: data.liveUrl || '',
    published: Boolean(data.published),
    // Timestamps can briefly be null client-side right after a write with
    // serverTimestamp() before the server value round-trips back.
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
    updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
  };
}

function sortByCreatedDesc(projects) {
  return [...projects].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getPublishedProjects() {
  const snap = await getDocs(query(projectsRef, where('published', '==', true)));
  return sortByCreatedDesc(snap.docs.map(toPlainProject));
}

export async function getMyProjects(uid) {
  const snap = await getDocs(query(projectsRef, where('uid', '==', uid)));
  return sortByCreatedDesc(snap.docs.map(toPlainProject));
}

export async function getProjectById(id) {
  const snap = await getDoc(doc(db, 'projects', id));
  if (!snap.exists()) return null;
  return toPlainProject(snap);
}

export async function createProject(uid, authorName, fields) {
  const docRef = await addDoc(projectsRef, {
    uid,
    authorName,
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    imageUrl: fields.imageUrl,
    tags: fields.tags,
    repoUrl: fields.repoUrl,
    liveUrl: fields.liveUrl,
    published: Boolean(fields.published),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProject(id, fields) {
  await updateDoc(doc(db, 'projects', id), {
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    imageUrl: fields.imageUrl,
    tags: fields.tags,
    repoUrl: fields.repoUrl,
    liveUrl: fields.liveUrl,
    published: Boolean(fields.published),
    updatedAt: serverTimestamp(),
  });
}

export async function togglePublish(id, published) {
  await updateDoc(doc(db, 'projects', id), { published, updatedAt: serverTimestamp() });
}

export async function deleteProject(id) {
  await deleteDoc(doc(db, 'projects', id));
}
