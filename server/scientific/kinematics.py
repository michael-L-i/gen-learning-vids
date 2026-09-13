"""Analytic building blocks shared by diagrams and graphs (SI units).

No animation easing is used for physical time. Coordinate transforms keep the
drawn motion and its graph representations tied to the same state.
"""
from dataclasses import dataclass
import math


def projectile(position, velocity, acceleration, seconds):
    return tuple(p + v * seconds + .5 * a * seconds**2 for p, v, a in zip(position, velocity, acceleration))


@dataclass(frozen=True)
class InclineBounces:
    angle: float  # radians; incline descends toward the right
    height: float  # vertical drop before first impact
    gravity: float = 10.0

    def __post_init__(self):
        if not all(math.isfinite(x) for x in (self.angle, self.height, self.gravity)) or not 0 < self.angle < math.pi/2 or self.height <= 0 or self.gravity <= 0:
            raise ValueError("Use a finite incline angle between 0 and pi/2, and positive height/gravity")

    @property
    def impact_speed(self): return math.sqrt(2 * self.gravity * self.height)
    @property
    def drop_time(self): return self.impact_speed / self.gravity
    @property
    def u(self): return self.impact_speed * math.sin(self.angle)
    @property
    def w(self): return self.impact_speed * math.cos(self.angle)
    @property
    def a_parallel(self): return self.gravity * math.sin(self.angle)
    @property
    def a_normal(self): return -self.gravity * math.cos(self.angle)
    @property
    def period(self): return 2 * self.w / -self.a_normal

    def world(self, s, n):
        c, q = math.cos(self.angle), math.sin(self.angle)
        return s*c + n*q, -s*q + n*c

    def state(self, t):
        """t=0 is first impact; positive normal velocity is away from the slope.
        At collisions returns the state immediately AFTER impact.
        """
        if t < -self.drop_time - 1e-9:
            raise ValueError("Time precedes release")
        if t < 0:
            elapsed = t + self.drop_time
            x, y = projectile((0, self.height), (0, 0), (0, -self.gravity), elapsed)
            vy = -self.gravity * elapsed
            return dict(x=x, y=y, vx=0, vy=vy, s=-y*math.sin(self.angle), n=y*math.cos(self.angle), vs=-vy*math.sin(self.angle), vn=vy*math.cos(self.angle))
        tau = t % self.period
        s = self.u*t + .5*self.a_parallel*t*t
        n = self.w*tau + .5*self.a_normal*tau*tau
        vs, vn = self.u + self.a_parallel*t, self.w + self.a_normal*tau
        x,y = self.world(s,n)
        vx,vy = self.world(vs,vn)
        return dict(x=x,y=y,vx=vx,vy=vy,s=s,n=n,vs=vs,vn=vn)

    def spacing(self, interval):
        """interval=1 is the distance from the first impact to the second."""
        if not isinstance(interval, int) or interval < 1:
            raise ValueError("Use a positive integer interval")
        return self.u*self.period + self.a_parallel*self.period**2*(interval-.5)
