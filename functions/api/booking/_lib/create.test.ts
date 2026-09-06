import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeEvent, HOST_NAME } from './create.ts';

const booker = {
  firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null,
  location: 'video' as const, notes: 'React Native and Module Federation', guests: [] as string[], locale: 'en',
};
const base = { typeName: 'Intro call', question: 'What would you like to cover?', booker, hostPhone: '+44 20 7946 0000', manageUrl: 'https://warrendeleon.com/booking/manage/?id=1&token=t', origin: 'https://warrendeleon.com' };

describe('the event as Calendly writes it', () => {
  it('names both people in the title', () => {
    assert.equal(describeEvent(base).summary, `Intro call between ${HOST_NAME} and Jane Doe`);
  });

  it('lays the description out as labelled lines, in Calendly order', () => {
    const { description } = describeEvent(base);
    const paragraphs = description.split('\n\n');
    assert.equal(paragraphs[0], 'Event Name: Intro call');
    assert.equal(paragraphs[1], 'Location: Google Meet');
    assert.equal(paragraphs[2], 'What would you like to cover?: React Native and Module Federation');
    assert.match(paragraphs[3]!, /^Need to make changes to this event\?\nCancel: .*#cancel\nReschedule: .*#reschedule$/);
    assert.match(paragraphs[4]!, /work experience.*CV:\nhttps:\/\/warrendeleon\.com\/work-experience\/\?utm_source=calendar&utm_medium=email$/s);
    assert.equal(paragraphs[5], 'Booked at https://warrendeleon.com');
  });

  it('for a phone call, says who rings whom and keeps the caller number', () => {
    const { description, location } = describeEvent({ ...base, booker: { ...booker, location: 'phone', phone: '+44 7700 900123' } });
    assert.match(description, /Location: Phone call: you call Warren de Leon on \+44 20 7946 0000/);
    assert.match(description, /Invitee phone number: \+44 7700 900123/);
    assert.equal(location, '+44 20 7946 0000', 'the number to ring is the event location');
  });

  it('has no location field for a video call, so the Meet button stands alone', () => {
    assert.equal(describeEvent(base).location, null);
  });

  it('lists guests and links the page in the booker language', () => {
    const { description } = describeEvent({ ...base, booker: { ...booker, guests: ['ana@example.com', 'bo@example.org'], locale: 'es' } });
    assert.match(description, /Guests: ana@example\.com, bo@example\.org/);
    assert.match(description, /\/es\/work-experience\/\?utm_source=calendar&utm_medium=email/);
  });

  it('falls back to a plain Notes label when the type asks no question', () => {
    const { description } = describeEvent({ ...base, question: null });
    assert.match(description, /^Notes: React Native/m);
  });

  it('omits the answer line when nothing was written', () => {
    const { description } = describeEvent({ ...base, booker: { ...booker, notes: null } });
    assert.ok(!description.includes('What would you like to cover?'));
  });
});
