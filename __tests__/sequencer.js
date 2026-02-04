const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Run change-password tests last since they modify the database password
    const changePasswordTests = tests.filter((t) => t.path.includes('change-password'));
    const otherTests = tests.filter((t) => !t.path.includes('change-password'));

    return [...otherTests, ...changePasswordTests];
  }
}

module.exports = CustomSequencer;
