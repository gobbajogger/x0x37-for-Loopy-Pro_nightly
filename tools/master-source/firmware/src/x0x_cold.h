/* SPDX-License-Identifier: GPL-3.0-only */
/* X0X_COLD: small code for a function that is not on the audio, MIDI or timer path (boot, the UI).
 * The DSP units build at -O2; this attribute builds one function for size. The result is the same.
 * Other compilers (the host build) ignore it. */
#ifndef X0X_COLD_H
#define X0X_COLD_H
#ifdef __clang__
#define X0X_COLD __attribute__((minsize))
#else
#define X0X_COLD
#endif
#endif
