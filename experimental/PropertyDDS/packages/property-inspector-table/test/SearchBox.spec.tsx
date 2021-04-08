import { mount } from 'enzyme';
import * as React from 'react';
import { SearchBox } from '../src/SearchBox';

describe('SearchBox', () => {
  const totalResults = 100;
  const mountSearchBox = (props) => {
    return mount(
      <SearchBox
        searchExpression='TEST'
        totalResults={totalResults}
        {...props}
      />,
    );
  };

  it('should show control buttons on focus', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy });

    expect(wrapper.findWhere((node) => node.key() === 'previous').length).toEqual(0);
    expect(wrapper.findWhere((node) => node.key() === 'next').length).toEqual(0);
    expect(wrapper.findWhere((node) => node.key() === 'close').length).toEqual(0);

    wrapper.find('input').simulate('focus');
    expect(wrapper.findWhere((node) => node.key() === 'previous').length).toEqual(1);
    expect(wrapper.findWhere((node) => node.key() === 'next').length).toEqual(1);
    expect(wrapper.findWhere((node) => node.key() === 'close').length).toEqual(1);
  });

  it('should cycle when going through results', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy });
    wrapper.find('input').simulate('focus');
    wrapper.findWhere((node) => node.key() === 'previous').simulate('click');
    expect(callbackSpy).toHaveBeenCalledWith(totalResults - 1);
    wrapper.setProps({ currentResult: totalResults });
    wrapper.findWhere((node) => node.key() === 'next').simulate('click');
    expect(callbackSpy).toHaveBeenCalledWith(0);
  });

  it('should go to next result on enter', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy });
    wrapper.find('input').simulate('keydown', { key: 'Enter', shiftKey: false });
    expect(callbackSpy).toHaveBeenCalledWith(1);
  });

  it('should go to previous result on shift + enter', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy });
    wrapper.find('input').simulate('keydown', { key: 'Enter', shiftKey: true });
    expect(callbackSpy).toHaveBeenCalledWith(totalResults - 1);
  });

  it('should change height on focus', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy, searchInProgress: true });
    expect(wrapper.find('[role="progressbar"]').prop('style')!.height).toEqual(1);
    wrapper.find('input').simulate('focus');
    expect(wrapper.find('[role="progressbar"]').prop('style')!.height).toEqual(  3);
  });

  it('should show animation on search in progress', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy, searchInProgress: true });
    expect(wrapper.find('[role="progressbar"]').prop('style')!.opacity).toEqual(1);
  });

  it('should not show animation on search', () => {
    const callbackSpy = jest.fn();
    const wrapper = mountSearchBox({ currentResult: 0, onPrevious: callbackSpy, onNext: callbackSpy, searchInProgress: false });
    expect(wrapper.find('[role="progressbar"]').prop('style')!.opacity).toEqual(0);
  });

});
