import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from './schema';

// Deleting content writes a record of what was removed before it goes, so the
// Owner panel can show what people delete. Only Owners can read the log.
export async function deleteWithLog(kind, ref, data, actor) {
  try {
    await addDoc(collection(db, COL.deletionLog), {
      kind,                                   // 'post' | 'message'
      docId: ref.id,
      text: data.text || '',
      imageUrl: data.imageUrl || null,
      thread: data.thread || null,
      groupId: data.groupId || null,
      authorUid: data.uid || null,
      authorName: data.displayName || null,
      deletedBy: actor?.id || null,
      deletedByName: actor?.name || null,
      selfDelete: (data.uid || null) === (actor?.id || null),
      postedAt: data.createdAt || null,
      deletedAt: serverTimestamp()
    });
  } catch {
    // A failed audit write must not block the delete itself.
  }
  await deleteDoc(ref);
}

export const postRef = (id) => doc(db, COL.posts, id);
export const messageRef = (id) => doc(db, COL.messages, id);
