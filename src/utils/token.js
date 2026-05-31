import jwt from 'jsonwebtoken';

export const generateAccessToken = (payload) => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not defined');

  const { jti, ...rest } = payload;

  return jwt.sign(rest, secret, {
    expiresIn: '15m',
    algorithm: 'HS256',
    ...(typeof jti === 'string' && jti.length > 0 ? { jwtid: jti } : {}),
  });
};

export const generateRefreshToken = (payload) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not defined');

  const { jti, ...rest } = payload;

  return jwt.sign(rest, secret, {
    expiresIn: '7d',
    algorithm: 'HS256',
    ...(typeof jti === 'string' && jti.length > 0 ? { jwtid: jti } : {}),
  });
};
