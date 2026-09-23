const mongoose = require('mongoose');
const { updateProject, assignProject, deleteProject } = require('./src/services/project.service');
const { updateMarketplaceListing, removeMarketplaceListing } = require('./src/services/marketplace.service');
const Project = require('./src/models/Project');
const User = require('./src/models/User');
require('dotenv').config();

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/skillbridge_mvp');
  
  // Create dummy users
  const owner = await User.create({ fullName: 'Owner', email: 'owner' + Date.now() + '@test.com', password: 'password', role: 'client' });
  const otherUser = await User.create({ fullName: 'Other', email: 'other' + Date.now() + '@test.com', password: 'password', role: 'client' });
  const admin = await User.create({ fullName: 'Admin', email: 'admin' + Date.now() + '@test.com', password: 'password', role: 'admin' });
  
  // Create a project owned by owner
  const project = await Project.create({ title: 'Test Project', description: 'Test', client: owner._id, budget: 1000, status: 'open', skillsRequired: ['React'] });
  
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

  // 1. Owner can update
  await assertSucceeds(() => updateProject(project._id, { title: 'Updated By Owner' }, { id: owner._id.toString(), role: owner.role }), 'Owner can update project');
  
  // 2. Other user CANNOT update
  await assertThrowsWith403(() => updateProject(project._id, { title: 'Updated By Other' }, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot update project');
  
  // 3. Admin can update
  await assertSucceeds(() => updateProject(project._id, { title: 'Updated By Admin' }, { id: admin._id.toString(), role: admin.role }), 'Admin can update project');

  // Same for marketplace
  const listing = await Project.create({ title: 'Listing', description: 'Test', client: owner._id, budget: 1000, status: 'open', skillsRequired: ['React'] });
  
  // 2. Other user CANNOT remove listing
  await assertThrowsWith403(() => removeMarketplaceListing(listing._id, { id: otherUser._id.toString(), role: otherUser.role }), 'Other user cannot remove listing');
  
  // 3. Admin can remove listing
  await assertSucceeds(() => removeMarketplaceListing(listing._id, { id: admin._id.toString(), role: admin.role }), 'Admin can remove listing');
  
  // 1. Owner can delete project
  await assertSucceeds(() => deleteProject(project._id, { id: owner._id.toString(), role: owner.role }), 'Owner can delete project');

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  
  // cleanup
  await User.deleteMany({ email: { $in: [owner.email, otherUser.email, admin.email] } });
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
