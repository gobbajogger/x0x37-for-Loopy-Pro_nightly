// Measures the isolated, source-inspected build-9 LFO on Linux.
// Link with lfo_laws.cpp from the original_conductor_v1 experiment.
#include "lfo_laws.hpp"
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using original_conductor_v1::Status;
using original_conductor_v1::lfo_rate;
using original_conductor_v1::lfo_index;
using original_conductor_v1::lfo_phase;
using original_conductor_v1::shape_table_sample;

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    constexpr unsigned sample_rate = 8000;
    std::cout << "bin,normalized,bpm,hz,edge1,edge2,edge3,sample_rate\n";
    for (unsigned tempo : {90u, 120u, 180u}) {
        for (unsigned bin = 0; bin < 18; ++bin) {
            const float normalized = static_cast<float>(1.0 - bin / 17.0);
            float hz = 0;
            if (lfo_rate(normalized, false, tempo, {}, hz) != Status::State || !(hz > 0)) return 3;
            std::ostringstream path;
            path << argv[1] << "/bin-" << std::setw(2) << std::setfill('0') << bin
                 << "-" << tempo << ".u8";
            std::ofstream pcm(path.str(), std::ios::binary);
            if (!pcm) return 4;
            std::vector<unsigned> edges;
            float previous = -1;
            double phase = 0;
            const unsigned budget = static_cast<unsigned>(std::ceil(4.0 * sample_rate / hz)) + 4;
            for (unsigned frame = 0; frame < budget && edges.size() < 3; ++frame) {
                std::int64_t index = 0;
                float wave = 0;
                if (lfo_index(phase, index) != Status::State ||
                    shape_table_sample(2, static_cast<unsigned>(index), wave) != Status::State) return 5;
                pcm.put(static_cast<char>(wave > 0 ? 224 : 32));
                if (previous > 0 && wave < 0) edges.push_back(frame);
                previous = wave;
                if (lfo_phase(phase, hz, 1.0 / sample_rate, phase) != Status::State) return 6;
            }
            if (edges.size() != 3 || !pcm.good()) return 7;
            std::cout << bin << ',' << std::setprecision(10) << normalized << ',' << tempo << ','
                      << hz << ',' << edges[0] << ',' << edges[1] << ',' << edges[2] << ','
                      << sample_rate << '\n';
        }
    }
}
