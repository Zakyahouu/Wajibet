const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkEquipmentAccess } = require('../middleware/permissionMiddleware');
const ctrl = require('../controllers/equipmentController');

router.use(protect);
router.use(checkEquipmentAccess);

router.route('/')
  .get(ctrl.listEquipment)
  .post(ctrl.createEquipment);

router.route('/:id')
  .get(ctrl.getEquipment)
  .put(ctrl.updateEquipment)
  .delete(ctrl.deleteEquipment);

// Units management
router.post('/:id/units', authorize('manager', 'staff'), ctrl.adjustUnits); // body: { delta: +N | -N }
router.patch('/:id/units/:serial/state', authorize('manager', 'staff'), ctrl.updateUnitState); // body: { state }
router.patch('/:id/units/:serial', authorize('manager', 'staff'), ctrl.updateUnit); // body: { name?, state?, notes? }

module.exports = router;
