const Project = require('../models/Project');

const createProject = async (clientId, data) => {
  return Project.create({ ...data, client: clientId });
};

const getProjects = async (filters = {}) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.skill) query.skillsRequired = filters.skill;

  return Project.find(query)
    .populate('client', 'fullName email')
    .populate('assignedTo', 'fullName email')
    .sort({ createdAt: -1 });
};

const getProjectById = async (id) => {
  const project = await Project.findById(id)
    .populate('client', 'fullName email')
    .populate('assignedTo', 'fullName email')
    .populate('assignedSquad');

  if (!project) {
    const error = new Error('المشروع مش موجود');
    error.statusCode = 404;
    throw error;
  }
  return project;
};

const updateProject = async (id, updates, user) => {
  const existingProject = await Project.findById(id);
  if (!existingProject) {
    const error = new Error('المشروع مش موجود');
    error.statusCode = 404;
    throw error;
  }
  if (existingProject.client.toString() !== user.id && user.role !== 'admin') {
    const error = new Error('غير مصرح لك بتعديل هذا المشروع');
    error.statusCode = 403;
    throw error;
  }
  const project = await Project.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  return project;
};

const assignProject = async (id, { assignedTo, assignedSquad }, user) => {
  const existingProject = await Project.findById(id);
  if (!existingProject) {
    const error = new Error('المشروع مش موجود');
    error.statusCode = 404;
    throw error;
  }
  if (existingProject.client.toString() !== user.id && user.role !== 'admin') {
    const error = new Error('غير مصرح لك بتعيين هذا المشروع');
    error.statusCode = 403;
    throw error;
  }
  const project = await Project.findByIdAndUpdate(
    id,
    { assignedTo, assignedSquad, status: 'in_progress' },
    { new: true }
  );
  return project;
};

const deleteProject = async (id, user) => {
  const existingProject = await Project.findById(id);
  if (!existingProject) {
    const error = new Error('المشروع مش موجود');
    error.statusCode = 404;
    throw error;
  }
  if (existingProject.client.toString() !== user.id && user.role !== 'admin') {
    const error = new Error('غير مصرح لك بحذف هذا المشروع');
    error.statusCode = 403;
    throw error;
  }
  const project = await Project.findByIdAndDelete(id);
  return project;
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  assignProject,
  deleteProject,
};
