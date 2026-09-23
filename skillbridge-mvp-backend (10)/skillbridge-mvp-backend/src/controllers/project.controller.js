const projectService = require('../services/project.service');
const { matchJobsForStudent } = require('../ai/simpleModels');
const handleApiError = require('../utils/errorHandler');

const createProject = async (req, res) => {
  try {
    const project = await projectService.createProject(req.user.id, req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const getProjects = async (req, res) => {
  try {
    const projects = await projectService.getProjects(req.query);
    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.id);
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const updateProject = async (req, res) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const assignProject = async (req, res) => {
  try {
    const project = await projectService.assignProject(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const deleteProject = async (req, res) => {
  try {
    await projectService.deleteProject(req.params.id, req.user);
    res.status(200).json({ success: true, message: 'تم حذف المشروع' });
  } catch (error) {
    return handleApiError(res, error);
  }
};

// AI Job Matching - ترشيح مشاريع مناسبة للطالب الحالي بناءً على مهاراته
const getMatchedProjects = async (req, res) => {
  try {
    const { skills } = req.body; // مهارات الطالب
    const projects = await projectService.getProjects({ status: 'open' });
    const matched = matchJobsForStudent(skills || [], projects);
    res.status(200).json({ success: true, data: matched });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  assignProject,
  deleteProject,
  getMatchedProjects,
};
