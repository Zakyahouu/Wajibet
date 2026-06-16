const resolveSchoolId = (school) => {
  if (!school) return null;
  if (typeof school === 'string') return school;
  if (typeof school === 'object') {
    return school._id?.toString() || school.id?.toString() || null;
  }
  return null;
};

module.exports = {
  resolveSchoolId
};
