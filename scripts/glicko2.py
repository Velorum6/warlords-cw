"""Glicko-2 (Glickman 2012), one rating period at a time."""

from __future__ import annotations

import math
from dataclasses import dataclass

SCALE = 173.7178
TAU = 0.5
DEFAULT_RATING = 1500.0
DEFAULT_RD = 350.0
DEFAULT_VOL = 0.06
EPSILON = 1e-6


def _g(phi: float) -> float:
    return 1.0 / math.sqrt(1.0 + 3.0 * phi * phi / (math.pi * math.pi))


def _expect(mu: float, mu_opp: float, phi_opp: float) -> float:
    value = 1.0 / (1.0 + math.exp(-_g(phi_opp) * (mu - mu_opp)))
    return min(max(value, EPSILON), 1.0 - EPSILON)


def to_mu(rating: float) -> float:
    return (rating - DEFAULT_RATING) / SCALE


def to_phi(rd: float) -> float:
    return rd / SCALE


def from_mu(mu: float) -> float:
    return mu * SCALE + DEFAULT_RATING


def from_phi(phi: float) -> float:
    return phi * SCALE


@dataclass
class Rating:
    rating: float = DEFAULT_RATING
    rd: float = DEFAULT_RD
    vol: float = DEFAULT_VOL

    def snapshot(self) -> Rating:
        return Rating(self.rating, self.rd, self.vol)


def update_period(player: Rating, results: list[tuple[Rating, float]], tau: float = TAU) -> None:
    """Apply one Glicko-2 period. Each result is (opponent_snapshot, score in {0, 0.5, 1})."""
    mu = to_mu(player.rating)
    phi = to_phi(player.rd)
    sigma = player.vol
    if not results:
        player.rd = from_phi(math.sqrt(phi * phi + sigma * sigma))
        return

    v_inv = 0.0
    delta_sum = 0.0
    for opp, score in results:
        phi_j = to_phi(opp.rd)
        g_j = _g(phi_j)
        e_j = _expect(mu, to_mu(opp.rating), phi_j)
        v_inv += g_j * g_j * e_j * (1.0 - e_j)
        delta_sum += g_j * (score - e_j)
    v = 1.0 / v_inv
    delta = v * delta_sum

    a = math.log(sigma * sigma)
    phi2 = phi * phi

    def f(x: float) -> float:
        ex = math.exp(x)
        num = ex * (delta * delta - phi2 - v - ex)
        den = 2.0 * (phi2 + v + ex) ** 2
        return num / den - (x - a) / (tau * tau)

    a_val = a
    if delta * delta > phi2 + v:
        b_val = math.log(delta * delta - phi2 - v)
    else:
        k = 1
        b_val = a - k * tau
        while f(b_val) < 0 and k < 20:
            k += 1
            b_val = a - k * tau

    fa = f(a_val)
    fb = f(b_val)
    for _ in range(40):
        if abs(b_val - a_val) <= EPSILON:
            break
        c_val = a_val + (a_val - b_val) * fa / (fb - fa)
        fc = f(c_val)
        if fc * fb <= 0:
            a_val, fa = b_val, fb
        else:
            fa /= 2.0
        b_val, fb = c_val, fc

    sigma_new = math.exp(a_val / 2.0)
    phi_star = math.sqrt(phi2 + sigma_new * sigma_new)
    phi_new = 1.0 / math.sqrt(1.0 / (phi_star * phi_star) + 1.0 / v)
    mu_new = mu + phi_new * phi_new * delta_sum
    player.rating = from_mu(mu_new)
    player.rd = from_phi(phi_new)
    player.vol = sigma_new


def expected_delta(player: Rating, opp: Rating, score: float) -> float:
    """Rating change if `player` scored `score` against `opp` this period. Does not mutate inputs."""
    clone = player.snapshot()
    update_period(clone, [(opp, score)])
    return clone.rating - player.rating


def self_check() -> None:
    """Glickman 2012 worked example (three games, one period)."""
    player = Rating(1500.0, 200.0, 0.06)
    games = [
        (Rating(1400.0, 30.0), 1.0),
        (Rating(1550.0, 100.0), 0.0),
        (Rating(1700.0, 300.0), 0.0),
    ]
    update_period(player, games, tau=0.5)
    assert abs(player.rating - 1464.06) < 0.05, player.rating
    assert abs(player.rd - 151.52) < 0.05, player.rd
    assert abs(player.vol - 0.05999) < 0.0002, player.vol


if __name__ == "__main__":
    self_check()
    print("glicko2 self-check ok")
