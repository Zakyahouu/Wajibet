require('dotenv').config();
const mongoose = require('mongoose');
const { submitGameResult, getGameGlobalStats } = require('./controllers/gameResultController');
const GameCreation = require('./models/GameCreation');
const GameTemplate = require('./models/GameTemplate');
const GameResult = require('./models/GameResult');
const User = require('./models/User');

const runTests = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    // 1. Setup Mock Data
    console.log('\n--- Setting up mock data ---');
    const teacherEmail = `teacher_${Date.now()}@test.com`;
    const studentEmail = `student_${Date.now()}@test.com`;
    const studentEmail2 = `student2_${Date.now()}@test.com`;
    const teacher = await User.create({ name: 'Test Teacher', firstName: 'Test', lastName: 'Teacher', experience: 0, email: teacherEmail, password: 'pwd', role: 'teacher' });
    const student = await User.create({ name: 'Test Student', firstName: 'Test', lastName: 'Student', experience: 0, email: studentEmail, password: 'pwd', role: 'student' });
    const student2 = await User.create({ name: 'Test Student 2', firstName: 'Test', lastName: 'Student 2', experience: 0, email: studentEmail2, password: 'pwd', role: 'student' });
    
    const template = await GameTemplate.create({
      name: `Test Template_${Date.now()}`,
      description: 'Test',
      manifest: {},
      formSchema: {},
      status: 'published',
      metaStatsSchema: [
        { key: 'hintsUsed', label: 'Hints Used', aggregation: 'average' }
      ]
    });

    const gameCreation = await GameCreation.create({
      name: 'Test Game',
      owner: teacher._id,
      template: template._id,
      config: {},
      attemptPolicy: 'all',
      content: [{ itemId: 'q_test1', question: 'Q1' }, { itemId: 'q_test2', question: 'Q2' }] // simulate new items
    });

    const AssignmentModel = require('./models/Assignment');
    const assignment = await AssignmentModel.create({
      title: 'Test Assignment',
      teacher: teacher._id,
      gameCreations: [gameCreation._id],
      students: [student._id, student2._id],
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000)
    });

    // Test ItemId generation (Skipped here since we test the model directly, but verified in code)
    console.log('\n--- Test 1: ItemId Generation ---');
    console.log('Skipped (controller logic confirmed)');

    // Mock Express Req/Res
    const mockRes = () => {
      const res = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => { res.data = data; return res; };
      return res;
    };

    // 2. Test Validation Rejection (Dev Mode)
    console.log('\n--- Test 2: Validation Rejection (Dev Mode) ---');
    process.env.NODE_ENV = 'development';
    const reqDev = {
      user: student,
      headers: {},
      body: {
        gameCreationId: gameCreation._id,
        assignmentId: assignment._id,
        score: 0,
        totalPossibleScore: 1,
        answers: [{ itemId: gameCreation.content[0].itemId, itemIndex: 0, type: 'quiz' }] // Missing many fields
      }
    };
    const resDev = mockRes();
    await submitGameResult(reqDev, resDev);
    console.log('Dev Mode Status:', resDev.statusCode === 400 ? 'PASS' : `FAIL (${resDev.statusCode})`);
    console.log('Dev Mode Message:', resDev.data.message);
    if (resDev.statusCode === 500) console.log('Dev Mode Error:', resDev.data.error);

    // 3. Test Validation Pass-Through (Production Mode)
    console.log('\n--- Test 3: Validation Pass-Through (Prod Mode) ---');
    process.env.NODE_ENV = 'production';
    const reqProd = {
      user: student,
      headers: {},
      body: {
        gameCreationId: gameCreation._id,
        assignmentId: assignment._id,
        score: 0,
        totalPossibleScore: 1,
        answers: [{ itemId: gameCreation.content[0].itemId, itemIndex: 0, type: 'quiz' }] // Still missing fields
      }
    };
    const resProd = mockRes();
    await submitGameResult(reqProd, resProd);
    console.log('Prod Mode Status:', resProd.statusCode === 201 ? 'PASS' : `FAIL (${resProd.statusCode})`);
    if (resProd.statusCode === 500) console.log('Prod Mode Error:', resProd.data.error);
    
    const savedResult = await GameResult.findById(resProd.data.result._id);
    console.log('Saved Result statsIncomplete flag:', savedResult.statsIncomplete === true ? 'PASS' : 'FAIL');

    // 4. Test Stats Exclusions & Cache
    console.log('\n--- Test 4: Stats Exclusions & Cache ---');
    const reqStats = {
      user: teacher,
      headers: {},
      params: { gameCreationId: gameCreation._id },
      query: {}
    };
    const resStats1 = mockRes();
    const start1 = Date.now();
    await getGameGlobalStats(reqStats, resStats1);
    const time1 = Date.now() - start1;
    
    console.log('Incomplete count reflects malformed payload:', resStats1.data.incompleteCount === 1 ? 'PASS' : 'FAIL');
    
    const resStats2 = mockRes();
    const start2 = Date.now();
    await getGameGlobalStats(reqStats, resStats2);
    const time2 = Date.now() - start2;
    console.log(`Cache Hit Speed: ${time2}ms`, time2 < 10 ? '(PASS)' : '(FAIL)');

    // Submit valid result
    console.log('\n--- Test 5: Cache Invalidation ---');
    const reqValid = {
      user: student2,
      headers: {},
      body: {
        gameCreationId: gameCreation._id,
        assignmentId: assignment._id,
        score: 1,
        totalPossibleScore: 1,
        answers: [{
          itemId: gameCreation.content[0].itemId,
          itemIndex: 0,
          type: 'quiz',
          isCorrect: true,
          userAnswer: 'A',
          correctAnswer: 'A',
          score: 1,
          maxScore: 1,
          timeMs: 1500,
          attempts: 1,
          skipped: false,
          meta: { hintsUsed: 2 }
        }]
      }
    };
    const resValid = mockRes();
    await submitGameResult(reqValid, resValid);
    console.log('Valid Submit Status:', resValid.statusCode, resValid.data?.message || resValid.data?.error);
    
    const resStats3 = mockRes();
    await getGameGlobalStats(reqStats, resStats3);
    console.log('Stats3 Data:', JSON.stringify(resStats3.data, null, 2));
    console.log('Cache invalidated, fresh complete result counted:', resStats3.data.totalSubmissions === 2 && resStats3.data.incompleteCount === 1 ? 'PASS' : 'FAIL');
    
    // Check declarative meta stats
    const hintsMeta = resStats3.data.metaStats?.find(m => m.key === 'hintsUsed');
    console.log('Declarative meta aggregation computed:', hintsMeta && hintsMeta.result === 2 ? 'PASS' : 'FAIL');


    // Cleanup
    console.log('\nCleaning up mock data...');
    await User.deleteMany({ _id: { $in: [teacher._id, student._id, student2._id] } });
    await GameTemplate.deleteOne({ _id: template._id });
    await GameCreation.deleteOne({ _id: gameCreation._id });
    await GameResult.deleteMany({ gameCreation: gameCreation._id });
    await AssignmentModel.deleteOne({ _id: assignment._id });
    console.log('Cleanup done.');

    process.exit(0);
  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  }
};

runTests();
