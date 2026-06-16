const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkRoomsAccess } = require('../middleware/permissionMiddleware');
const ctrl = require('../controllers/roomController');

router.use(protect);
router.use(checkRoomsAccess);

router.route('/')
  .get(ctrl.listRooms)
  .post(ctrl.createRoom);

router.route('/:id')
  .get(ctrl.getRoom)
  .put(ctrl.updateRoom)
  .delete(ctrl.deleteRoom);

module.exports = router;
