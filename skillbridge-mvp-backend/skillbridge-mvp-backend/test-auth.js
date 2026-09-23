const mongoose = require('mongoose');
const { updateUser } = require('./src/services/user.service');
const { disbandSquad, createSquad } = require('./src/services/squad.service');
const { createPost, deletePost, acceptAnswer, addComment } = require('./src/services/community.service');
const User = require('./src/models/User');
require('dotenv').config();

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/skillbridge_mvp');
  
  // Create dummy users
  const owner = await User.create({ fullName: 'Owner', email: 'owner_auth' + Date.now() + '@test.com', password: 'password', role: 'client' });
  const otherUser = await User.create({ fullName: 'Other', email: 'other_auth' + Date.now() + '@test.com', password: 'password', role: 'client' });
  const admin = await User.create({ fullName: 'Admin', email: 'admin_auth' + Date.now() + '@test.com', password: 'password', role: 'admin' });
  
  let passed = 0;
  let failed = 0;
  
  const assertThrowsWith403 = async (fn, desc) => {
    try {
      await fn();
      console.error(`❌ FAILED: ${desc} (Did not throw)`);
      failed++;
    } catch (e) {
      if (e.statusCode === 403) {
        console.log(`✅ PASSED: ${desc}`);
        passed++;
      } else {
        console.error(`❌ FAILED: ${desc} (Threw wrong error: ${e.statusCode} - ${e.message})`);
        failed++;
      }
    }
  }

  const assertSucceeds = async (fn, desc) => {
    try {
      await fn();
      console.log(`✅ PASSED: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAILED: ${desc} (Threw error: ${e.message})`);
      failed++;
    }
  }

  console.log('Testing updateUser...');
  // 1. Owner can update own profile
  await assertSucceeds(() => updateUser(owner._id, { fullName: 'Updated' }, { id: owner._id.toString(), role: owner.role }), 'Owner can update own profile');
  // 2. Other user CANNOT update owner's profile
  await assertThrowsWith403(() => updateUser(owner._id, { fullName: 'Hacked' }, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot update profile');
  // 3. Admin can update owner's profile
  await assertSucceeds(() => updateUser(owner._id, { fullName: 'Admin Updated' }, { id: admin._id.toString(), role: admin.role }), 'Admin can update profile');

  console.log('Testing disbandSquad...');
  const squad = await createSquad(owner._id, { name: 'Test Squad' });
  // 2. Other user CANNOT disband
  await assertThrowsWith403(() => disbandSquad(squad._id, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot disband squad');
  // 3. Admin can disband
  await assertSucceeds(() => disbandSquad(squad._id, { id: admin._id.toString(), role: admin.role }), 'Admin can disband squad');

  console.log('Testing acceptAnswer and deletePost...');
  const post = await createPost(owner._id, { title: 'Test', content: 'Test' });
  await addComment(post._id, otherUser._id, 'Answer');
  const updatedPost = await User.model('Post').findById(post._id); // Reload to get comment id
  const commentId = updatedPost.comments[0]._id;

  // 2. Other user CANNOT accept answer
  await assertThrowsWith403(() => acceptAnswer(post._id, commentId, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot accept answer');
  // 1. Owner CAN accept answer
  await assertSucceeds(() => acceptAnswer(post._id, commentId, { id: owner._id.toString(), role: owner.role }), 'Owner can accept answer');
  
  // 2. Other user CANNOT delete post
  await assertThrowsWith403(() => deletePost(post._id, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot delete post');
  // 3. Admin can delete post
  await assertSucceeds(() => deletePost(post._id, { id: admin._id.toString(), role: admin.role }), 'Admin can delete post');


  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  
  // cleanup
  await User.deleteMany({ email: { $in: [owner.email, otherUser.email, admin.email] } });
  await User.model('Squad').deleteMany({ name: 'Test Squad' });
  await User.model('Post').deleteMany({ title: 'Test' });

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
