/**
 * Seed 3,000 expenses for Insights performance testing.
 * Per docs/15-mvp-completion-plan.md Phase 3 gate: render under 300ms.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// This would need actual Firebase config
// For now, this is a template structure
const firebaseConfig = {
  // Add your Firebase config here
};

async function seedPerfData() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  
  // Sign in
  const userCredential = await signInAnonymously(auth);
  const userId = userCredential.user.uid;
  
  const categories = ['FOOD', 'TRANSPORT', 'FUN', 'HEALTH', 'RENT', 'UTILITIES', 'OTHER', 'SHOPPING'];
  const batchSize = 500; // Firestore batch limit is 500
  const totalExpenses = 3000;
  
  console.log(`Seeding ${totalExpenses} expenses for user ${userId}...`);
  
  for (let i = 0; i < totalExpenses; i += batchSize) {
    const batch = writeBatch(db);
    const count = Math.min(batchSize, totalExpenses - i);
    
    for (let j = 0; j < count; j++) {
      const expenseRef = collection(db, `users/${userId}/expenses`).doc();
      const daysAgo = Math.floor(Math.random() * 90); // Spread over 90 days
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      
      const localDate = date.toISOString().split('T')[0];
      const categoryId = categories[Math.floor(Math.random() * categories.length)];
      const amount = Math.floor(Math.random() * 50000) + 1000; // ₹10 to ₹500
      
      batch.set(expenseRef, {
        localDate,
        categoryId,
        total: { minor: amount, currency: 'INR' },
        createdAt: Timestamp.fromDate(date),
        deletedAt: null,
      });
    }
    
    await batch.commit();
    console.log(`Seeded ${i + count}/${totalExpenses} expenses`);
  }
  
  console.log('Seeding complete!');
  console.log('Run the performance test flow to measure render time.');
}

// Run if called directly
if (require.main === module) {
  seedPerfData().catch(console.error);
}

export { seedPerfData };
