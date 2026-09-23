const userService = require('../services/user.service');
const handleApiError = require('../utils/errorHandler');

const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const getMe = async (req, res) => {
  try {
    const user = await userService.getUserById(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await userService.updateUserRole(req.params.id, role);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    res.status(200).json({ success: true, message: 'تم حذف المستخدم' });
  } catch (error) {
    return handleApiError(res, error);
  }
};

const addPortfolioProject = async (req, res) => {
  try {
    const { title, description, skills, link, imageUrl } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'عنوان ووصف المشروع مطلوبين' });
    }
    const user = await userService.addPortfolioProject(req.user.id, { title, description, skills, link, imageUrl });
    res.status(201).json({ success: true, data: user.portfolioProjects });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = { getAllUsers, getUserById, getMe, updateUser, updateUserRole, deleteUser, addPortfolioProject };
