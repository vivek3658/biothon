const Organization = require('../models/Organization');

exports.getNearbyOrganizations = async (request, reply) => {
  try {
    const { lat, lng, query = '', facilityType = '' } = request.query || {};
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    const filter = {};
    if (facilityType && facilityType !== 'all') {
      filter.facilityType = facilityType;
    }
    if (query.trim()) {
      filter.$or = [
        { name: { $regex: query.trim(), $options: 'i' } },
        { facilityType: { $regex: query.trim(), $options: 'i' } },
        { 'location.city': { $regex: query.trim(), $options: 'i' } }
      ];
    }

    const organizations = await Organization.find(filter)
      .select('name facilityType location coordinates contactNumber verificationStatus specialities')
      .lean();

    const withDistance = organizations.map((organization) => {
      const [orgLng = 0, orgLat = 0] = organization.coordinates || [];
      let distanceKm = null;
      if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        const dx = orgLat - latitude;
        const dy = orgLng - longitude;
        distanceKm = Math.sqrt((dx * dx) + (dy * dy)) * 111;
      }
      return { ...organization, distanceKm };
    }).sort((a, b) => (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER));

    return reply.send({ success: true, organizations: withDistance });
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to fetch nearby organizations.', details: err.message });
  }
};
