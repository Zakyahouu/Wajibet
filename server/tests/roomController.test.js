const roomController = require('../controllers/roomController');
const Room = require('../models/Room');
const ClassModel = require('../models/Class');
const SchoolCatalog = require('../models/SchoolCatalog');

jest.mock('../models/Room', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock('../models/Class', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/SchoolCatalog', () => ({
  findOne: jest.fn(),
}));

describe('roomController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts canonical school catalog activity bucket keys when creating a room', async () => {
    SchoolCatalog.findOne.mockResolvedValue({
      supportLessons: [{}],
      reviewCourses: [],
      vocationalTrainings: [],
      languages: [],
      otherActivities: [],
    });

    Room.create.mockResolvedValue({
      _id: 'room-1',
      name: 'Room 1',
      capacity: 20,
      activityTypes: ['supportLessons'],
    });

    const req = {
      user: {
        role: 'manager',
        school: 'school-1',
      },
      body: {
        name: 'Room 1',
        capacity: 20,
        activityTypes: ['supportLessons'],
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await roomController.createRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        activityTypes: ['supportLessons'],
      })
    );
  });

  it('returns a conflict when a room is still linked to a class', async () => {
    const room = {
      _id: 'room-1',
      schoolId: 'school-1',
      name: 'Room 1',
      capacity: 20,
    };

    Room.findById.mockResolvedValue(room);
    ClassModel.findOne.mockResolvedValue({ _id: 'class-1' });

    const req = {
      user: {
        role: 'manager',
        school: { _id: 'school-1' },
      },
      params: { id: 'room-1' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await roomController.deleteRoom(req, res);

    expect(ClassModel.findOne).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Room cannot be deleted while assigned to one or more classes.',
    });
  });
});
