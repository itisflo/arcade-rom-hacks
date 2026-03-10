## Interleaved 16-bit ROM Architecture

The M68000 CPU has a 16-bit data bus. Two 8-bit ROM chips are paired and accessed in
parallel — one provides the **high byte**, the other the **low byte** of each word.

| Virtual range       | High byte file | Low byte file  | Base       |
|---------------------|----------------|----------------|------------|
| `0x000000–0x03FFFF` | `ff_36.11f`    | `ff_42.11h`    | `0x000000` |
| `0x040000–0x07FFFF` | `ff_37.12f`    | `ffe_43.12h`   | `0x040000` |

Address to file offset formula:

```
file_offset = (virtual_address - base) / 2
```

The `/2` is because each file only stores every other byte (all highs or all lows),
so it is half the size of the virtual address space it covers.

Example from the interleave diagram:

```
ff_36.11f (high): 53  00  66  61  ...
ff_42.11h (low):  2E  0A  0E  00  ...
Virtual words:  532E 000A 660E 6100 ...  (at 0x0, 0x2, 0x4, 0x6)
```

## Remove “Insert Coin” message in-game

```asm
016040: 532E 000A           subq.b  #1, ($a,A6)         ; decrement the "Insert Coin" counter (at A6+0xa)
016044: 660E                bne     $16054              ; if counter != 0, skip to rts (nothing to do yet)
016046: 6100 018A           bsr     $161d2              ; counter hit 0: call the "Insert Coin" display routine
01604A: 426E 0006           clr.w   ($6,A6)
01604E: 1D7C 003B 000A      move.b  #$3b, ($a,A6)       ; reload the counter with 0x3b (59 frames)
016054: 4E75                rts
```

## Remove "Go" message in-game

```asm
06144C: 536E 003C           subq.w  #1, ($3c,A6)        ; decrement the "Go" counter (at A6+0x3c)
061450: 6618                bne     $6146a              ; if counter != 0, skip to rts
061452: 4EB8 390C           jsr     $390c.w             ; counter hit 0: call the "Go" display routine
061456: 660C                bne     $61464
061458: 197C 0001 0000      move.b  #$1, ($0,A4)
06145E: 197C 0002 0013      move.b  #$2, ($13,A4)
061464: 3D7C 01A4 003C      move.w  #$1a4, ($3c,A6)    ; reload the counter with 0x1a4 (420 frames)
06146A: 4E75                rts
```